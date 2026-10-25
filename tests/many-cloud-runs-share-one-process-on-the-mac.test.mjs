// MANY CLOUD RUNS SHARE ONE PROCESS ON THE MAC.
//
// What broke: she asked for 50 to 100 agents at once in the cloud
// (2026-10-17). Each cloud run kept its own relay on her Mac, a whole runtime
// at about 75 MB (measured that day), so 100 runs cost the Mac gigabytes of
// mostly waiting.
//
// Now every run's relay lives in one host process (main/cloud/host.mjs), and
// for each run the supervisor holds a small stand-in (scripts/cloud-shim.pl)
// that carries the run's input, output, signals and exit code there and back.
// Driven here with the real stand-in against the real host, and a stand-in
// run that echoes; then with this Mac's real relay against the real sandbox.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startCloudHost, hostSocketPath, perlRunsTheShim } from '../main/cloud/host.mjs';

const SHIM = fileURLToPath(new URL('../scripts/cloud-shim.pl', import.meta.url));
let host; let tmp; const others = [];
afterEach(async () => { await host?.close(); host = null; for (const h of others.splice(0)) await h.close(); if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); });

// A run that says hello on both streams, echoes its input, ends at the end
// of it with 7, and on SIGTERM with 143, on SIGHUP with 0 after saying so.
async function echoRun({ args, env, cwd, stdin, stdout, stderr, signals, pid }) {
  stdout.write(`args=${args.join(' ')} cwd=${cwd} item=${env.ZERO_ITEM} pid=${pid}\n`);
  stderr.write('agentbox cloud: started\n');
  return new Promise((resolve) => {
    stdin.on('data', (d) => stdout.write(`echo:${d}`));
    stdin.on('end', () => resolve(7));
    signals.on('SIGTERM', () => resolve(143));
    signals.on('SIGHUP', () => { stderr.write('agentbox cloud: left going\n'); resolve(0); });
  });
}

function startHost(runOne = echoRun) {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-host-'));
  const sockPath = path.join(tmp, 'h.sock');
  host = startCloudHost({ sockPath, runOne, idleMs: 60_000 });
  return sockPath;
}
const ready = async (sockPath) => { for (let i = 0; i < 100 && !fs.existsSync(sockPath); i += 1) await new Promise((r) => setTimeout(r, 20)); };
function shim(sockPath, args, { env = {} } = {}) {
  const child = spawn('/usr/bin/perl', [SHIM, sockPath, ...args], { cwd: tmp, env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  const out = { stdout: '', stderr: '' };
  child.stdout.on('data', (d) => { out.stdout += d; });
  child.stderr.on('data', (d) => { out.stderr += d; });
  out.exited = new Promise((r) => child.on('exit', (code) => r(code)));
  return { child, out };
}
const until = async (fact, ms = 10_000) => { const end = Date.now() + ms; while (!fact()) { if (Date.now() > end) throw new Error('never happened'); await new Promise((r) => setTimeout(r, 20)); } };

describe('a run through the host', () => {
  it('gets its arguments, environment, folder and stand-in, and its input, output and exit code go through', async () => {
    const sockPath = startHost();
    await ready(sockPath);
    const { child, out } = shim(sockPath, ['-p', '--output-format', 'stream-json'], { env: { ZERO_ITEM: 'w-1' } });
    await until(() => out.stdout.includes('args='));
    expect(out.stdout).toContain(`args=-p --output-format stream-json cwd=${fs.realpathSync(tmp)} item=w-1 pid=${child.pid}`);
    child.stdin.write('hello\n');
    await until(() => out.stdout.includes('echo:hello'));
    child.stdin.end();
    expect(await out.exited).toBe(7);
    expect(out.stderr).toContain('agentbox cloud: started');
  });

  it('a stop reaches the run as one, and its exit code comes back', async () => {
    const sockPath = startHost();
    await ready(sockPath);
    const { child, out } = shim(sockPath, []);
    await until(() => out.stdout.includes('args='));
    child.kill('SIGTERM');
    expect(await out.exited).toBe(143);
  });

  it('a stand-in killed outright leaves its run going, as a quit does', async () => {
    let left = false;
    const sockPath = startHost(async (o) => { const code = await echoRun(o); left = true; return code; });
    await ready(sockPath);
    const { child, out } = shim(sockPath, []);
    await until(() => out.stdout.includes('args='));
    child.kill('SIGKILL');
    await until(() => left);
  });

  it('many at once, each its own', async () => {
    const sockPath = startHost();
    await ready(sockPath);
    const runs = Array.from({ length: 20 }, (_, i) => shim(sockPath, [`run-${i}`], { env: { ZERO_ITEM: `w-${i}` } }));
    await until(() => runs.every((r) => r.out.stdout.includes('args=')));
    expect(host.live()).toBe(20);
    runs.forEach((r, i) => r.child.stdin.end(`from ${i}\n`));
    expect(await Promise.all(runs.map((r) => r.out.exited))).toEqual(runs.map(() => 7));
    runs.forEach((r, i) => expect(r.out.stdout).toContain(`echo:from ${i}\n`));
  });

  it('with no host there, says so and exits as a fault the supervisor delivers again', async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-host-'));
    const { out } = shim(path.join(tmp, 'none.sock'), []);
    expect(await out.exited).toBe(75);
    expect(out.stderr).toMatch(/the cloud host is not running/);
  });

  it('costs a few megabytes a run', async () => {
    const sockPath = startHost();
    await ready(sockPath);
    const { child, out } = shim(sockPath, []);
    await until(() => out.stdout.includes('args='));
    const kb = Number(execFileSync('ps', ['-o', 'rss=', '-p', String(child.pid)], { encoding: 'utf8' }).trim());
    expect(kb).toBeLessThan(15 * 1024);
    child.stdin.end();
    await out.exited;
  });
});

// Claude's review (2026-10-17): a host started beside one still running took
// its socket, and the older one, ending, deleted the newer one's, so every run
// after that failed until the app restarted. And a run whose stand-in died
// while its output was held back waited for ever for room to write.
describe('two hosts, and a stand-in that dies', () => {
  it('a second host on the same socket leaves it to the one there', async () => {
    const sockPath = startHost();
    await ready(sockPath);
    const second = startCloudHost({ sockPath, runOne: echoRun });
    others.push(second);
    expect(await second.started).toBe('taken');
    const { child, out } = shim(sockPath, []);
    await until(() => out.stdout.includes('args='));
    expect(host.live()).toBe(1);
    child.stdin.end();
    expect(await out.exited).toBe(7);
  });

  it('a host that ends does not take away a newer host\'s socket', async () => {
    const sockPath = startHost();
    await ready(sockPath);
    expect(await host.started).toBe('serving');
    fs.unlinkSync(sockPath);
    const newer = startCloudHost({ sockPath, runOne: echoRun });
    others.push(newer);
    expect(await newer.started).toBe('serving');
    await host.close();
    host = null;
    expect(fs.existsSync(sockPath)).toBe(true);
    const { child, out } = shim(sockPath, []);
    await until(() => out.stdout.includes('args='));
    child.stdin.end();
    expect(await out.exited).toBe(7);
  });

  it('a run whose stand-in dies while its output is held back still ends', async () => {
    let ended = false;
    const sockPath = startHost(async ({ stdout, signals }) => {
      let hup = false;
      signals.on('SIGHUP', () => { hup = true; });
      const chunk = Buffer.alloc(64 * 1024, 120);
      while (!hup) { if (!stdout.write(chunk)) await new Promise((r) => stdout.once('drain', r)); }
      ended = true;
      return 0;
    });
    await ready(sockPath);
    const { child } = shim(sockPath, []);
    child.stdout.pause();
    await new Promise((r) => setTimeout(r, 500));
    child.kill('SIGKILL');
    await until(() => ended && host.live() === 0);
  });
});

describe('perl', () => {
  it('runs the stand-in where it has every module the stand-in needs, and not where it lacks one', () => {
    expect(perlRunsTheShim('/usr/bin/perl')).toBe(true);
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-host-'));
    const broken = path.join(tmp, 'perl');
    fs.writeFileSync(broken, '#!/bin/sh\necho "Can\'t locate JSON/PP.pm in @INC" >&2\nexit 2\n', { mode: 0o755 });
    expect(perlRunsTheShim(broken)).toBe(false);
    expect(perlRunsTheShim(path.join(tmp, 'nothing-here'))).toBe(false);
  });
});

describe('the host\'s socket', () => {
  it('is this user\'s, named for the code it runs, and short enough for macOS', () => {
    const p = hostSocketPath({ stamp: 'abcdef123456', dir: '/var/folders/xy/abcdefghijklmnopqrstuvwxyz012345/T', uid: 501 });
    expect(p).toMatch(/-cloud-501-abcdef123456\.sock$/);
    // With the host's own name for it before it is moved into place.
    expect(Buffer.byteLength(`${p}.99999991`)).toBeLessThan(104);
  });
});

describe('the supervisor', () => {
  it('starts a cloud run as a stand-in on the host where this Mac has perl, and as a relay of its own where told not to', async () => {
    const { Supervisor } = await import('../main/supervisor.mjs');
    const sockPath = startHost();
    await ready(sockPath);
    const appDir = fileURLToPath(new URL('..', import.meta.url));
    const sup = new Supervisor({ storeRoot: tmp, home: tmp, authProfiles: ['default'] }, { listItems: () => [], listProducts: () => [], isDue: () => true }, appDir, tmp, tmp);
    sup._cloudHost = () => sockPath;
    const child = sup._spawnCloudRelay(['--x'], { cwd: tmp, env: { ...process.env, ZERO_ITEM: 'w-9', ELECTRON_RUN_AS_NODE: '1' } });
    expect(child.spawnfile).toBe('/usr/bin/perl');
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    await until(() => out.includes('args='));
    expect(out).toContain('args=--x');
    expect(out).toContain('item=w-9');
    child.stdin.end();
    expect(await new Promise((r) => child.on('exit', r))).toBe(7);

    sup.config.cloudHost = false;
    const relay = sup._spawnCloudRelay(['--x'], { cwd: tmp, env: { ...process.env } });
    expect(relay.spawnfile).toBe(process.execPath);
    expect(relay.spawnargs[1]).toMatch(/main\/cloud\/run-cli\.mjs$/);
    relay.kill();
  });

  it('starts a host again when its socket has gone, and uses one another app left running', async () => {
    const { Supervisor } = await import('../main/supervisor.mjs');
    const { HOST_ALREADY_THERE } = await import('../main/cloud/host.mjs');
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-host-'));
    const appDir = fileURLToPath(new URL('..', import.meta.url));
    const sup = new Supervisor({ storeRoot: tmp, home: tmp, authProfiles: ['default'] }, { listItems: () => [], listProducts: () => [], isDue: () => true }, appDir, tmp, tmp);
    sup._cloudHostSock = path.join(tmp, 'h.sock');
    // Another app's host serves the socket: this one's own start found it there.
    fs.writeFileSync(sup._cloudHostSock, '');
    const finished = { exitCode: HOST_ALREADY_THERE, signalCode: null };
    sup._cloudHostProc = finished;
    expect(sup._cloudHost()).toBe(sup._cloudHostSock);
    expect(sup._cloudHostProc).toBe(finished);
    // A host still alive but ending: its socket gone, so a new one starts.
    fs.unlinkSync(sup._cloudHostSock);
    const ending = { exitCode: null, signalCode: null };
    sup._cloudHostProc = ending;
    sup._cloudHostAt = Date.now() - 60_000;
    expect(sup._cloudHost()).toBe(sup._cloudHostSock);
    expect(sup._cloudHostProc).not.toBe(ending);
    try {
      await until(() => fs.existsSync(sup._cloudHostSock));
      // Running with its socket there: used, no third.
      const started = sup._cloudHostProc;
      expect(sup._cloudHost()).toBe(sup._cloudHostSock);
      expect(sup._cloudHostProc).toBe(started);
    } finally {
      sup._cloudHostProc.kill();
    }
  });

  it('ships the stand-in outside the app\'s archive, where perl can read it', () => {
    const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(pkg.build.asarUnpack).toContain('scripts/cloud-shim.pl');
  });
});
