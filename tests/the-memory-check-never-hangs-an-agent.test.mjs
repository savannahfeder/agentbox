// THE MEMORY CHECK NEVER HANGS AN AGENT — w-3958c3753d.
//
// WHAT THIS GUARDS. Every shell command a worker runs first asks the app
// whether memory allows it (scripts/memory-gate-hook.sh, run by Claude Code as a
// PreToolUse hook). A check that hangs or breaks would stall every agent at
// once, which is worse than the memory problem it exists to fix.
//
// MEASURED ON THE REAL CLI, Claude Code 2.1.289, 2026-10-04 (scratch harness,
// haiku, one command per run):
//   - a hook that waits 8 s or 95 s holds the command and then lets it run;
//   - a hook that answers deny blocks it and the model reads the reason;
//   - a hook that times out, crashes or prints garbage LETS THE COMMAND RUN.
// So nothing here can be strictly fail-closed, and the check is built to fail
// open on purpose and fast: no app listening means run now, the app going away
// mid-wait means run now, and every wait ends inside the hook's own time limit.
// `nc -U` was tried first and quits before a slow answer arrives; curl waits,
// costs about 9 ms per check, and fails in 16 ms with nothing listening.
//
// These tests run the real script against a real local socket.

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MemoryGateServer } from '../main/memory-gate-server.mjs';
import { CommandHistory } from '../main/memory-gate-history.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const HOOK = path.join(root, 'scripts', 'memory-gate-hook.sh');

const servers = [];
const dirs = [];
afterEach(async () => {
  for (const s of servers.splice(0)) await s.stop();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function tmpDir() {
  // Short on purpose: a Unix socket path is limited to 104 bytes on macOS.
  const d = fs.mkdtempSync(path.join('/tmp', 'gate-'));
  dirs.push(d);
  return d;
}

async function makeServer(dir, opts = {}) {
  const history = new CommandHistory();
  for (let i = 0; i < 3; i++) history.record('git status', { peakMb: 10, durationMs: 100 });
  const server = new MemoryGateServer({
    socketPath: path.join(dir, 'g.sock'),
    historyFile: path.join(dir, 'history.json'),
    history,
    readPressure: async () => ({ level: 1, freePct: 50 }),
    sampleProcesses: async () => [],
    pollMs: 50,
    takeoverMs: 50,
    // Its own lock port, so tests never meet the real app or each other.
    lockPort: 0,
    gate: { slots: 1, ...(opts.gate ?? {}) },
    ...opts,
  });
  servers.push(server);
  await server.start();
  return server;
}

/** Run the hook as Claude Code would: event name as argument, hook JSON on stdin. */
function runHook(dir, mode, { id = 't1', command = 'npm test', env = {}, sock } = {}) {
  const input = JSON.stringify({
    session_id: 's1', hook_event_name: mode === 'pre' ? 'PreToolUse' : 'PostToolUse', tool_name: 'Bash',
    tool_use_id: id, tool_input: { command }, duration_ms: 1200,
  });
  const child = spawn('/bin/sh', [HOOK, mode], {
    env: {
      PATH: process.env.PATH,
      AGENTBOX_GATE_SOCK: sock ?? path.join(dir, 'g.sock'),
      AGENTBOX_GATE_ITEM: 'w-test', AGENTBOX_GATE_PRODUCT: 'demo', AGENTBOX_GATE_SCORE: '5',
      AGENTBOX_GATE_RETRY_S: '0.1',
      ...env,
    },
  });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  const started = Date.now();
  const done = new Promise((resolve) => child.on('close', (code) => resolve({ code, out, ms: Date.now() - started })));
  // The hook exits before reading stdin when no socket is there (`exit 0` on
  // the first line that checks it). A write into that closed pipe is EPIPE,
  // and on a fast machine it arrives after the test has already passed.
  child.stdin.on('error', (err) => { if (err.code !== 'EPIPE') throw err; });
  child.stdin.end(input);
  return { child, done };
}

const isWaiting = (p, ms = 300) => Promise.race([p.then(() => false), new Promise((r) => setTimeout(() => r(true), ms))]);

describe('the check, when memory allows', () => {
  it('answers in well under a second and says nothing, so Claude Code carries on as normal', async () => {
    const dir = tmpDir();
    await makeServer(dir);
    const r = await runHook(dir, 'pre', { command: 'git status' }).done;
    expect(r.code).toBe(0);
    expect(r.out).toBe('');
    expect(r.ms).toBeLessThan(1_000);
  });
});

describe('the check, when the slot is taken', () => {
  it('holds the second heavy command until the first one finishes', async () => {
    const dir = tmpDir();
    await makeServer(dir);
    expect((await runHook(dir, 'pre', { id: 'first' }).done).out).toBe('');
    const second = runHook(dir, 'pre', { id: 'second', command: 'cargo build' });
    expect(await isWaiting(second.done)).toBe(true);
    await runHook(dir, 'post', { id: 'first' }).done;
    const r = await second.done;
    expect(r.code).toBe(0);
    expect(r.out).toBe('');
  });

  it('ends a long wait with a refusal Claude Code understands', async () => {
    const dir = tmpDir();
    await makeServer(dir, { gate: { slots: 1, maxWaitMs: 200 } });
    await runHook(dir, 'pre', { id: 'first' }).done;
    const r = await runHook(dir, 'pre', { id: 'second', command: 'cargo build' }).done;
    const said = JSON.parse(r.out);
    expect(said.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(said.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(said.hookSpecificOutput.permissionDecisionReason).toMatch(/memory/i);
  });

  it('forgets a waiting command whose agent went away, so it holds nobody up', async () => {
    const dir = tmpDir();
    const server = await makeServer(dir);
    await runHook(dir, 'pre', { id: 'first' }).done;
    const second = runHook(dir, 'pre', { id: 'second', command: 'cargo build' });
    await isWaiting(second.done);
    expect(server.status().waiting).toHaveLength(1);
    second.child.kill('SIGTERM');
    await second.done;
    await new Promise((r) => setTimeout(r, 100));
    expect(server.status().waiting).toHaveLength(0);
  });
});

describe('the check fails open, and fast', () => {
  it('with no app listening at all, the command runs at once', async () => {
    const dir = tmpDir();
    const r = await runHook(dir, 'pre', { sock: path.join(dir, 'nobody.sock') }).done;
    expect(r.code).toBe(0);
    expect(r.out).toBe('');
    expect(r.ms).toBeLessThan(500);
  });

  it('with a socket left behind by a crashed app, it runs after a few short retries', async () => {
    const dir = tmpDir();
    const sock = path.join(dir, 'stale.sock');
    // A process that listens and is then killed outright leaves its socket file
    // behind with nobody on the other end, which is what a crashed app leaves.
    const holder = spawn(process.execPath, ['-e', `require('node:net').createServer().listen(${JSON.stringify(sock)}, () => console.log('up'))`]);
    await new Promise((r) => holder.stdout.once('data', r));
    holder.kill('SIGKILL');
    await new Promise((r) => holder.on('close', r));
    expect(fs.statSync(sock).isSocket()).toBe(true);
    const r = await runHook(dir, 'pre', { sock }).done;
    expect(r.code).toBe(0);
    expect(r.out).toBe('');
    expect(r.ms).toBeLessThan(3_000);
  });

  it('when the gate is switched off mid-wait, the waiting command runs', async () => {
    const dir = tmpDir();
    const server = await makeServer(dir);
    await runHook(dir, 'pre', { id: 'first' }).done;
    const second = runHook(dir, 'pre', { id: 'second', command: 'cargo build' });
    expect(await isWaiting(second.done)).toBe(true);
    await server.stop();
    const r = await second.done;
    expect(r.code).toBe(0);
    expect(r.out).toBe('');
    expect(fs.existsSync(path.join(dir, 'g.sock'))).toBe(false);
  });

  it('the after-command report never waits on anything', async () => {
    const dir = tmpDir();
    const r = await runHook(dir, 'post', { sock: path.join(dir, 'nobody.sock') }).done;
    expect(r.code).toBe(0);
    expect(r.ms).toBeLessThan(500);
  });
});

describe('one coordinator per Mac', () => {
  /** A port nothing holds right now, for two coordinators to contend over. */
  const freePort = async () => {
    const net = await import('node:net');
    const s = net.createServer();
    await new Promise((r) => s.listen({ host: '127.0.0.1', port: 0 }, r));
    const { port } = s.address();
    await new Promise((r) => s.close(r));
    return port;
  };

  it('a second app stands by, and takes over when the first one stops', async () => {
    const dir = tmpDir();
    const lockPort = await freePort();
    const first = await makeServer(dir, { lockPort });
    const second = await makeServer(dir, { lockPort });
    expect(first.role).toBe('owner');
    expect(second.role).toBe('standby');
    await first.stop();
    for (let i = 0; i < 40 && second.role !== 'owner'; i++) await new Promise((r) => setTimeout(r, 25));
    expect(second.role).toBe('owner');
    expect((await runHook(dir, 'pre', { command: 'git status' }).done).out).toBe('');
  });

  // THE OLD ELECTION REPLACED AN OWNER THAT WAS SLOW TO ANSWER (2026-10-05,
  // found by Codex): a socket silent for a second was unlinked and taken, so a
  // stalled owner and a new one could both run. The lock is a port now.
  it('an owner that has stopped answering is never replaced, and its socket never removed', async () => {
    const dir = tmpDir();
    const lockPort = await freePort();
    const stalled = await makeServer(dir, { lockPort });
    // Stalled: still alive and holding the lock, but no longer answering.
    stalled.server.close();
    const second = await makeServer(dir, { lockPort });
    // Several takeover attempts' worth of waiting.
    await new Promise((r) => setTimeout(r, 300));
    expect(second.role).toBe('standby');
    expect(stalled.role).toBe('owner');
  });

  it('takes over a socket file nobody is listening on', async () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'g.sock'), '');
    const server = await makeServer(dir);
    expect(server.role).toBe('owner');
  });
});

describe('rank', () => {
  it('uses the app\'s live rank for its own tasks, and the spawn-time rank otherwise', async () => {
    const dir = tmpDir();
    const server = await makeServer(dir, { scoreFor: (product, item) => (item === 'w-live' ? 209 : null) });
    await runHook(dir, 'pre', { id: 'first' }).done;
    const env = runHook(dir, 'pre', { id: 'env', command: 'cargo build', env: { AGENTBOX_GATE_ITEM: 'w-other', AGENTBOX_GATE_SCORE: '7' } });
    const live = runHook(dir, 'pre', { id: 'live', command: 'cargo build', env: { AGENTBOX_GATE_ITEM: 'w-live' } });
    await isWaiting(live.done);
    const scores = Object.fromEntries(server.status().waiting.map((w) => [w.item, w.score]));
    expect(scores).toEqual({ 'w-other': 7, 'w-live': 209 });
    env.child.kill(); live.child.kill();
  });

  it('a score that is not a number is read as zero, not as the whole request failing', async () => {
    const dir = tmpDir();
    await makeServer(dir);
    const r = await runHook(dir, 'pre', { command: 'git status', env: { AGENTBOX_GATE_SCORE: '5; rm -rf /' } }).done;
    expect(r.code).toBe(0);
    expect(r.out).toBe('');
  });
});
