// A TERMINAL OUTLIVES AN APP RESTART (w-7b5b89d886).
//
// What broke: a phone app's dev server was meant to run for hours, and it kept
// stopping. Task terminals were children of the app, and the app's quit ended
// every shell and everything under it (main/ipc.mjs `before-quit` ->
// TaskTerminals.shutdown), so each Restart after a ship, and each restart an
// agent did to deploy, took every running server with it.
//
// Measured here with a real shell: a background `sleep` started in a task
// terminal, the app's connection dropped the way a quit drops it, and a fresh
// app instance opening the same terminal. Before main/terminal-host.mjs there
// was no host to find, and the shell died with the app.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TaskTerminals, terminalEnv } from '../main/task-terminals.mjs';
import { TerminalHosts } from '../main/terminal-hosts.mjs';
import { serveTerminals, terminalHostSocket, PROTOCOL } from '../main/terminal-host.mjs';

async function until(fn, ms = 7000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return; await new Promise((r) => setTimeout(r, 50)); }
  throw new Error('Timed out');
}
// Alive and not a zombie: some machines' first process never reaps orphans.
function alive(pid) {
  try { process.kill(pid, 0); } catch { return false; }
  try { return !/^\d+ \(.*\) Z /.test(fs.readFileSync(`/proc/${pid}/stat`, 'utf8')); } catch { return true; }
}
// A socket's path has to fit in 104 bytes on macOS, so not under its long tmpdir.
const shortDir = () => fs.mkdtempSync(path.join(fs.existsSync('/tmp') ? '/tmp' : os.tmpdir(), 'th-'));

// The folders the real shell and host were living in. Killing the host closes
// the pty, so the shell takes its SIGHUP a moment later and writes
// .zsh_history into HOME, which is one of these folders: a file landing
// between the walk and the rmdir of a single rmSync is ENOTEMPTY. maxRetries
// cannot help, because it retries the rmdir and not the sweep of children. A
// folder left behind in tmp is not a failure, so this gives up quietly.
async function removeWhereAShellLived(dir, ms = 5000) {
  const end = Date.now() + ms;
  for (;;) {
    try { fs.rmSync(dir, { recursive: true, force: true }); return; } catch { /* still dying */ }
    if (Date.now() > end) return;
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('with a real shell and a real host process', () => {
  it('a server started in a task terminal is still running, its output still there, after the app restarts', async () => {
    const dir = shortDir();
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'terminal work '));
    const place = { cwd: work, env: { ...terminalEnv(), HOME: work } };
    let hostPid = null;
    let serverPid = null;
    try {
      const first = new TerminalHosts({ local: new TaskTerminals({ sweepMs: 0 }), dir, logFile: path.join(dir, 'host.log') });
      await first.open('k', place);
      await first.write('k', "sleep 300 & echo $! > server.pid; printf 'SERVER-%s\\n' UP\r");
      await until(async () => (await first.read('k', 0)).data.includes('SERVER-UP'));
      serverPid = Number(fs.readFileSync(path.join(work, 'server.pid'), 'utf8'));
      hostPid = (await [...first.conns.values()][0].call('hello')).pid;

      // The app quits: its connection goes, and it ends nothing on the way.
      for (const conn of first.conns.values()) conn.close();
      await new Promise((r) => setTimeout(r, 200));

      const second = new TerminalHosts({ local: new TaskTerminals({ sweepMs: 0 }), dir });
      const back = await second.open('k', place);
      expect(back.data).toContain('SERVER-UP');
      expect(alive(serverPid)).toBe(true);
      // The same shell, not a new one: it still takes what is typed.
      await second.write('k', "printf 'STILL-%s\\n' HERE\r");
      await until(async () => (await second.read('k', 0)).data.includes('STILL-HERE'));
      // And one host, not one per launch.
      expect(second.conns.size).toBe(1);
    } finally {
      if (hostPid) try { process.kill(hostPid, 'SIGTERM'); } catch { /* gone */ }
      if (serverPid) try { process.kill(serverPid, 'SIGKILL'); } catch { /* gone */ }
      await removeWhereAShellLived(dir);
      await removeWhereAShellLived(work);
    }
  }, 20000);
});

// The rest drive the host in this process over a real socket, with fake shells.
function fakeTerminals(opts = {}) {
  const made = [];
  const spawn = vi.fn(() => {
    let onData = () => {};
    const child = { pid: 5000 + made.length, process: 'zsh', write: vi.fn(), resize: vi.fn(), kill: vi.fn(), onData: (f) => { onData = f; }, onExit: () => {}, say: (t) => onData(t) };
    made.push(child);
    return child;
  });
  const terminals = new TaskTerminals({ spawn, disposeProcess: (p) => p.kill(), sweepMs: 0, ...opts });
  return { terminals, made, spawn };
}
async function host(sockPath, opts = {}) {
  const t = fakeTerminals();
  const served = serveTerminals({ sockPath, terminals: t.terminals, ...opts });
  expect(await served.started).toBe('serving');
  return { ...t, served };
}
const place = { cwd: '/tmp' };

describe('which host a terminal is in', () => {
  it('a terminal an older version of the app left stays reachable, and new ones open in the current host', async () => {
    const dir = shortDir();
    const oldEnded = vi.fn();
    const old = await host(terminalHostSocket({ stamp: 'old', dir }), { idleMs: 50, onIdle: oldEnded });
    old.terminals.open('k-old', place);
    let current = null;
    const launch = vi.fn((sockPath) => { void host(sockPath).then((h) => { current = h; }); });
    const app = new TerminalHosts({ local: fakeTerminals().terminals, stamp: 'new', dir, launch });
    try {
      await app.open('k-old', place);
      expect(launch).not.toHaveBeenCalled();
      await app.write('k-old', 'ls\r');
      expect(old.made[0].write).toHaveBeenCalledWith('ls\r');

      await app.open('k-new', place);
      expect(launch).toHaveBeenCalledTimes(1);
      expect(current.terminals.sessions.has('k-new')).toBe(true);
      expect(old.terminals.sessions.has('k-new')).toBe(false);
      expect((await app.list()).map((s) => s.key).sort()).toEqual(['k-new', 'k-old']);

      // Once the older host holds nothing, the app lets go of it so it can end.
      await app.close('k-old');
      await app.list();
      expect([...app.conns.keys()]).toEqual([terminalHostSocket({ stamp: 'new', dir })]);
      await new Promise((r) => setTimeout(r, 300));
      expect(oldEnded).toHaveBeenCalled();
    } finally {
      for (const c of app.conns.values()) c.close();
      await old.served.close();
      await current?.served.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a host speaking another protocol is left alone', async () => {
    const dir = shortDir();
    const net = await import('node:net');
    const odd = net.createServer((s) => s.on('data', (d) => {
      const { id } = JSON.parse(String(d).split('\n')[0]);
      s.write(`${JSON.stringify({ id, value: { protocol: PROTOCOL + 1 } })}\n`);
    }));
    const oddPath = terminalHostSocket({ stamp: 'odd', dir });
    await new Promise((r) => odd.listen(oddPath, r));
    let current = null;
    const app = new TerminalHosts({ local: fakeTerminals().terminals, stamp: 'new', dir, launch: (p) => { void host(p).then((h) => { current = h; }); } });
    try {
      await app.open('k', place);
      expect([...app.conns.keys()]).toEqual([terminalHostSocket({ stamp: 'new', dir })]);
    } finally {
      for (const c of app.conns.values()) c.close();
      await current?.served.close();
      await new Promise((r) => odd.close(r));
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('when no host will start', () => {
  it('the terminal still opens, in the app, and its first line says it ends when the app quits', async () => {
    const dir = shortDir();
    const local = fakeTerminals();
    let t = 0;
    const launch = vi.fn();
    const app = new TerminalHosts({ local: local.terminals, dir, launch, startMs: 300, now: () => t });
    try {
      const state = await app.open('k', place);
      expect(state.data).toContain('This terminal ends when Agentbox quits');
      expect(local.terminals.sessions.has('k')).toBe(true);
      // It is not tried again on every open: nothing retries for ever.
      await app.open('k2', place);
      expect(launch).toHaveBeenCalledTimes(1);
      t += 5 * 60_000;
      await app.open('k3', place);
      expect(launch).toHaveBeenCalledTimes(2);
      await app.write('k', 'ls\r');
      expect(local.made[0].write).toHaveBeenCalledWith('ls\r');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('when no host will start, quickly', () => {
  it('a host that stops as it starts is given up on at once, not after the whole wait', async () => {
    const dir = shortDir();
    const app = new TerminalHosts({ local: fakeTerminals().terminals, dir, launch: () => ({ exitCode: 1 }), startMs: 8000 });
    const at = Date.now();
    try {
      const state = await app.open('k', place);
      expect(state.data).toContain('(it exited with code 1)');
      expect(Date.now() - at).toBeLessThan(2000);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('whose socket it is', () => {
  it('a socket another user owns is never spoken to', async () => {
    const dir = shortDir();
    const other = await host(terminalHostSocket({ stamp: 'other', dir }));
    other.terminals.open('k', place);
    const realUid = process.getuid;
    process.getuid = () => realUid.call(process) + 1;
    const app = new TerminalHosts({ local: fakeTerminals().terminals, stamp: 'mine', dir, uid: realUid.call(process), launch: vi.fn(), startMs: 200 });
    try {
      await app.discover();
      expect(app.conns.size).toBe(0);
      expect(app.hasTerminal('k')).toBe(false);
    } finally {
      process.getuid = realUid;
      await other.served.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('what the app knows about a task\'s terminal', () => {
  it('knows the moment one opens and the moment it closes, for the folder rule', async () => {
    const dir = shortDir();
    let current = null;
    const app = new TerminalHosts({ local: fakeTerminals().terminals, stamp: 'now', dir, launch: (p) => { void host(p).then((h) => { current = h; }); } });
    const k = JSON.stringify({ product: 'p', id: 'w-a' });
    try {
      expect(app.hasTerminal('w-a')).toBe(false);
      await app.open(k, place);
      expect(app.hasTerminal('w-a')).toBe(true);
      expect(app.hasTerminal('w-b')).toBe(false);
      await app.close(k);
      expect(app.hasTerminal('w-a')).toBe(false);
      await app.open(k, place);
      current.terminals.close(k);
      await app.list();
      expect(app.hasTerminal('w-a')).toBe(false);
    } finally {
      for (const c of app.conns.values()) c.close();
      await current?.served.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('the host ends itself', () => {
  it('a minute after it has no terminal and no app, and never while a terminal is open', async () => {
    const dir = shortDir();
    const onIdle = vi.fn();
    const h = await host(terminalHostSocket({ stamp: 'idle', dir }), { idleMs: 60 });
    h.served.close();
    const kept = await host(terminalHostSocket({ stamp: 'kept', dir }), { idleMs: 60, onIdle: () => onIdle('kept') });
    kept.terminals.open('k', place);
    const empty = await host(terminalHostSocket({ stamp: 'empty', dir }), { idleMs: 60, onIdle: () => onIdle('empty') });
    try {
      await new Promise((r) => setTimeout(r, 300));
      expect(onIdle.mock.calls.map((c) => c[0])).toContain('empty');
      expect(onIdle.mock.calls.map((c) => c[0])).not.toContain('kept');
    } finally {
      await kept.served.close();
      await empty.served.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('every call has a deadline: a host that never answers is an error, not a wait', async () => {
    const dir = shortDir();
    const net = await import('node:net');
    const mute = net.createServer((s) => s.resume());
    const mutePath = terminalHostSocket({ stamp: 'mute', dir });
    await new Promise((r) => mute.listen(mutePath, r));
    const { connectTerminalHost } = await import('../main/terminal-hosts.mjs');
    const conn = await connectTerminalHost(mutePath, { callMs: 200 });
    const at = Date.now();
    try {
      await expect(conn.call('hello')).rejects.toThrow('did not answer');
      expect(Date.now() - at).toBeLessThan(2000);
    } finally {
      conn.close();
      await new Promise((r) => mute.close(r));
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
