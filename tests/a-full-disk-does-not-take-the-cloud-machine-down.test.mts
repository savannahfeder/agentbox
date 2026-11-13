// A FULL DISK DOES NOT TAKE THE CLOUD MACHINE DOWN.
//
// On 2026-11-09 ten cloud runs ended with "This thread's cloud machine stopped
// N minutes into its run", one of them 1 h 49 min into rendering 60 Blender
// frames. The sandbox server is the machine's first process, so when it dies
// the machine goes with everything the run had not sent home. It wrote each
// line of the agent's output to its log with a bare `fs.writeSync`, inside the
// output handler: measured on a 40 MB disk, a command that filled the disk and
// kept printing ended the server with an uncaught ENOSPC within a second.
//
// Now a write the disk refuses frees a reserve kept for this and is tried
// again, an event the disk still cannot take is kept in memory so the stream
// has no gap, the run is told its disk is full, and an exception nothing
// caught is logged instead of ending the machine.

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
let bundle: Buffer;

beforeEach(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'full-disk-'));
  const repo = path.join(tmp, 'mac', 'repo');
  fs.mkdirSync(repo, { recursive: true });
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, '-c', 'user.email=a@example.com', '-c', 'user.name=A', 'commit', '-q', '--allow-empty', '-m', 'first');
  git(repo, 'checkout', '-q', '-b', 'agentbox/w-1');
  git(repo, 'bundle', 'create', path.join(tmp, 'in.bundle'), 'agentbox/w-1', 'main');
  bundle = fs.readFileSync(path.join(tmp, 'in.bundle'));
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

async function until<T>(fn: () => Promise<T>, what: string, ms = 20_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

type Event = { seq: number; kind: string; data?: string; message?: string; code?: number };
async function drain(sb: NonNullable<typeof sandbox>): Promise<Event[]> {
  const out: Event[] = [];
  for (;;) {
    const r = await sb.handle({ action: 'events', since: out.length ? out[out.length - 1].seq : 0, waitMs: 0 });
    if (!r.events.length) return out;
    out.push(...r.events);
  }
}
const stdoutOf = (events: Event[]) => Buffer.concat(events.filter((e) => e.kind === 'stdout').map((e) => Buffer.from(e.data!, 'base64'))).toString('utf8');

// The command prints 200 numbered lines, a few at a time, so the disk can
// fill between two of them.
const PRINTS = 'let i=0;const t=setInterval(()=>{for(let k=0;k<20;k++)process.stdout.write("line "+(i++)+"\\n");if(i>=200)clearInterval(t)},5)';
const expected = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n') + '\n';

// The disk "fills" for the run's own log once `after` writes have gone to it.
function diskFillsAfter(after: number, { lasts = Infinity }: { lasts?: number } = {}) {
  const real = fs.writeSync;
  let toLog = 0;
  let refused = 0;
  const spy = vi.spyOn(fs, 'writeSync').mockImplementation(((fd: number, ...rest: unknown[]) => {
    if (Buffer.isBuffer(rest[0]) && rest[0].subarray(0, 7).toString() === '{"seq":') {
      toLog += 1;
      if (toLog > after && refused < lasts) {
        refused += 1;
        throw Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC', errno: -28, syscall: 'write' });
      }
    }
    return (real as (...a: unknown[]) => number)(fd, ...rest);
  }) as typeof fs.writeSync);
  return { spy, refused: () => refused };
}

const start = (sb: NonNullable<typeof sandbox>, runId: string) => sb.handle({
  action: 'start', runId, cwd: path.join(tmp, 'vm', 'w'), branch: 'agentbox/w-1',
  bundleUrl: `${base}/in.bundle`, argv: [process.execPath, '-e', PRINTS], env: {},
});

describe('a full disk on a cloud machine', () => {
  it('keeps the server answering and every line of output, with no gap, when the disk stays full', async () => {
    sandbox = createSandbox({ workRoot: path.join(tmp, 'vm') });
    const disk = diskFillsAfter(8);
    expect((await start(sandbox, 'run-full')).ok).toBe(true);
    await until(async () => (await sandbox!.handle({ action: 'status' })).state === 'exited', 'the command to exit');
    expect(disk.refused()).toBeGreaterThan(0);
    const events = await drain(sandbox);
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1));
    expect(stdoutOf(events)).toBe(expected);
    expect(events.find((e) => e.kind === 'exit')).toMatchObject({ code: 0 });
    expect(events.some((e) => e.kind === 'error' && /disk is full/.test(e.message!))).toBe(true);
  });

  it('frees its reserve on the first refused write, so the log goes on on disk', async () => {
    const workRoot = path.join(tmp, 'vm');
    sandbox = createSandbox({ workRoot, reserveBytes: 64 * 1024 });
    const reserve = path.join(workRoot, '.reserve');
    expect(fs.statSync(reserve).size).toBe(64 * 1024);
    const disk = diskFillsAfter(8, { lasts: 1 });
    await start(sandbox, 'run-reserve');
    await until(async () => (await sandbox!.handle({ action: 'status' })).state === 'exited', 'the command to exit');
    expect(disk.refused()).toBe(1);
    expect(fs.existsSync(reserve)).toBe(false);
    const events = await drain(sandbox);
    expect(stdoutOf(events)).toBe(expected);
    // Every event reached the file, the one refused included.
    const onDisk = fs.readFileSync(path.join(workRoot, '.agentbox', 'run-reserve', 'events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l).seq);
    expect(onDisk).toEqual(events.map((e) => e.seq));
  });

  it('touches neither its reserve nor the log when the disk has room', async () => {
    const workRoot = path.join(tmp, 'vm');
    sandbox = createSandbox({ workRoot, reserveBytes: 64 * 1024 });
    await start(sandbox, 'run-room');
    await until(async () => (await sandbox!.handle({ action: 'status' })).state === 'exited', 'the command to exit');
    expect(fs.statSync(path.join(workRoot, '.reserve')).size).toBe(64 * 1024);
    const events = await drain(sandbox);
    expect(stdoutOf(events)).toBe(expected);
    expect(events.some((e) => e.kind === 'error')).toBe(false);
  });
});

describe('the cloud machine\'s server', () => {
  it('logs an exception nothing caught and goes on serving, rather than ending the machine', () => {
    const server = path.resolve('cloud/sandbox/server.mjs');
    const script = `import { keepServing } from ${JSON.stringify(server)};
keepServing((line) => process.stderr.write(line + '\\n'));
setTimeout(() => { throw new Error('a bug nobody caught'); }, 10);
setTimeout(() => Promise.reject(new Error('a promise nobody caught')), 20);
setTimeout(() => process.stdout.write('still serving'), 60);`;
    const out = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 20_000 });
    expect(out.stdout).toBe('still serving');
    expect(out.status).toBe(0);
    expect(out.stderr).toContain('a bug nobody caught');
    expect(out.stderr).toContain('a promise nobody caught');
  });
});
