// A CLOUD MACHINE THAT DIES LEAVES WHY IN ITS LOG.
//
// On 2026-11-12 a cloud run's machine went about a minute after its agent
// began (19:01 UTC), on the image with the disk and memory fixes. Every call
// to it after that got "An error occurred when starting the runtime", and the
// Mac gave the run up at 19:04:58. The machine's whole CloudWatch log for that
// hour was one line per machine, "agentbox sandbox listening on 8080": no
// crash, no memory or disk reading, nothing to say whether AWS stopped it or
// it ran out of something. The memory guard and the disk reserve told only
// the run's own event log, which is on the machine and was lost with it.
//
// Now the runtime's log carries each run's state changes, a reading of free
// memory and free disk once a minute while a run is going, the memory guard's
// and the disk reserve's actions, and a line when AWS asks the server to stop.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync, spawnSync } from 'node:child_process';
import { createSandbox } from '../cloud/sandbox/server.mjs';

const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'gc.auto=0', '-c', 'maintenance.auto=false', ...args], { cwd, encoding: 'utf8' }).trim();

let tmp: string; let fileServer: http.Server; let base: string;
let sandbox: ReturnType<typeof createSandbox> | null = null;

beforeEach(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'machine-trace-'));
  const repo = path.join(tmp, 'mac', 'repo');
  fs.mkdirSync(repo, { recursive: true });
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, '-c', 'user.email=a@example.com', '-c', 'user.name=A', 'commit', '-q', '--allow-empty', '-m', 'first');
  git(repo, 'checkout', '-q', '-b', 'agentbox/w-1');
  git(repo, 'bundle', 'create', path.join(tmp, 'in.bundle'), 'agentbox/w-1', 'main');
  const bundle = fs.readFileSync(path.join(tmp, 'in.bundle'));
  fileServer = http.createServer((req, res) => { res.writeHead(200); res.end(bundle); });
  await new Promise<void>((r) => fileServer.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(fileServer.address() as { port: number }).port}`;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await sandbox?.close();
  sandbox = null;
  fileServer.closeAllConnections();
  await new Promise((r) => fileServer.close(r));
  try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch { /* best effort */ }
});

async function until<T>(fn: () => T | Promise<T>, what: string, ms = 20_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

const start = (sb: NonNullable<typeof sandbox>, runId: string, js: string) => sb.handle({
  action: 'start', runId, cwd: path.join(tmp, 'vm', 'w'), branch: 'agentbox/w-1',
  bundleUrl: `${base}/in.bundle`, argv: [process.execPath, '-e', js], env: {},
});

describe('the cloud machine\'s own log', () => {
  it('names each state a run goes through, by the end of its id', async () => {
    const lines: string[] = [];
    sandbox = createSandbox({ workRoot: path.join(tmp, 'vm'), log: (l: string) => lines.push(l) });
    await start(sandbox, 'run-0000-stateful', 'process.stdout.write("hi")');
    await until(async () => (await sandbox!.handle({ action: 'status' })).state === 'exited', 'the command to exit');
    expect(lines).toContain('run stateful preparing');
    expect(lines).toContain('run stateful running');
  });

  it('reads free memory and free disk once a period while a run is going', async () => {
    const lines: string[] = [];
    sandbox = createSandbox({ workRoot: path.join(tmp, 'vm'), traceEveryMs: 40, log: (l: string) => lines.push(l) });
    await start(sandbox, 'run-0000-readings', 'setTimeout(() => {}, 600)');
    await until(() => lines.filter((l) => / readings running \d+ s in: .* memory free, \d+ MB disk free, agent alive$/.test(l)).length >= 3, 'three readings');
  });

  it('stops reading once the run is over, so an idle machine does not fill the log', async () => {
    const lines: string[] = [];
    sandbox = createSandbox({ workRoot: path.join(tmp, 'vm'), traceEveryMs: 40, log: (l: string) => lines.push(l) });
    // Its code cannot be fetched, so the run is over (failed) without the command ever starting.
    await sandbox.handle({
      action: 'start', runId: 'run-0000-idleidle', cwd: path.join(tmp, 'vm', 'w'), branch: 'agentbox/w-1',
      bundleUrl: 'http://127.0.0.1:1/in.bundle', argv: [process.execPath, '-e', ''], env: {},
    });
    await until(() => lines.includes('run idleidle failed'), 'the run to be over', 10_000);
    const readings = () => lines.filter((l) => / in: /.test(l)).length;
    const before = readings();
    await new Promise((r) => setTimeout(r, 300));
    expect(readings()).toBe(before);
  });

  it('reads nothing at all when no period is set', async () => {
    const lines: string[] = [];
    sandbox = createSandbox({ workRoot: path.join(tmp, 'vm'), log: (l: string) => lines.push(l) });
    await start(sandbox, 'run-0000-noperiod', 'setTimeout(() => {}, 300)');
    await until(async () => (await sandbox!.handle({ action: 'status' })).state === 'exited', 'the command to exit');
    expect(lines.some((l) => / in: /.test(l))).toBe(false);
  });

  it('says when the disk filled and its reserve was given up', async () => {
    const lines: string[] = [];
    sandbox = createSandbox({ workRoot: path.join(tmp, 'vm'), reserveBytes: 64 * 1024, log: (l: string) => lines.push(l) });
    const real = fs.writeSync;
    let refused = 0;
    // The first output event, which every run has however its output is chunked.
    vi.spyOn(fs, 'writeSync').mockImplementation(((fd: number, ...rest: unknown[]) => {
      if (Buffer.isBuffer(rest[0]) && rest[0].subarray(0, 7).toString() === '{"seq":' && rest[0].includes('"kind":"stdout"') && refused < 1) {
        refused += 1;
        throw Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' });
      }
      return (real as (...a: unknown[]) => number)(fd, ...rest);
    }) as typeof fs.writeSync);
    await start(sandbox, 'run-0000-diskfull', 'for (let i = 0; i < 20; i++) process.stdout.write("line " + i + "\\n")');
    await until(async () => (await sandbox!.handle({ action: 'status' })).state === 'exited', 'the command to exit');
    expect(lines).toContain('run diskfull: the disk is full; gave up the disk reserve');
  });
});

describe('the cloud machine\'s server, asked to stop', () => {
  it('says so in its log, with how long it had been up and what the run was doing', () => {
    const server = path.resolve('cloud/sandbox/server.mjs');
    const script = `import { sayWhenAskedToStop } from ${JSON.stringify(server)};
sayWhenAskedToStop((line) => process.stderr.write(line + '\\n'), () => 'run abcd1234 running 61 s in');
setInterval(() => {}, 1000);
setTimeout(() => process.kill(process.pid, 'SIGTERM'), 50);`;
    const out = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 20_000 });
    expect(out.stderr).toMatch(/^asked to stop \(SIGTERM\) \d+ s after the machine started; run abcd1234 running 61 s in$/m);
    // The signal then does what it did before: this process is not PID 1, so it ends.
    expect(out.signal).toBe('SIGTERM');
  });

  it('says there was no run when none was going', () => {
    const server = path.resolve('cloud/sandbox/server.mjs');
    const script = `import { sayWhenAskedToStop } from ${JSON.stringify(server)};
sayWhenAskedToStop((line) => process.stderr.write(line + '\\n'), () => null);
setInterval(() => {}, 1000);
setTimeout(() => process.kill(process.pid, 'SIGTERM'), 50);`;
    const out = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 20_000 });
    expect(out.stderr).toMatch(/^asked to stop \(SIGTERM\) \d+ s after the machine started; no run going$/m);
  });
});
