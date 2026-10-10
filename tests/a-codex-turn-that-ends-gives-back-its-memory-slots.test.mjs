// A CODEX TURN THAT ENDS GIVES BACK ITS MEMORY SLOTS — w-713aba0c89.
//
// WHAT BROKE, measured off the session logs of 2026-10-07. From 21:05 to 21:39
// no Claude worker's command that needed one of the two heavy slots started at
// all, the only Urgent row's among them, while Codex workers kept running
// commands (test runs included) the whole time. Every waiting command was
// released inside two seconds at 21:39:44, after one `codex app-server`'s last
// activity at 21:33 and before the next started at 21:40. The gate keeps no
// record of who held a slot, so that last link is timing, not a log.
//
// Two things in how the gate holds Codex commands make that shape:
//
//   - ONE app-server runs every Codex thread, so two Codex commands at once
//     are measured as the same figure: everything new under that process. A
//     `cat` in one thread running beside a test run in another reads as the
//     test run's gigabyte, and each of them then held a slot of its own. Two
//     Codex commands could hold both slots off one test run. A shared reading
//     is one reading, so they now hold ONE slot between them. A command the
//     history knows is heavy still holds its own, as any heavy command does.
//
//   - Codex has no PostToolUseFailure (main/codex-memory-gate.mjs), so a
//     Codex command that FAILS never sends its "after" report, and its grant
//     outlives it. 230da50 lets such a grant go after twenty minutes. A
//     thread's turn ending is a firmer signal and a much earlier one: nothing
//     the turn ran is waiting on it any more. So when a Codex worker exits,
//     every grant its thread still holds is let go.
//
// Letting a slot go stops nothing that is running, and the kernel's pressure
// reading still holds the next heavy command if one really is still big.

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { MemoryGateServer } from '../main/memory-gate-server.mjs';
import { CommandHistory } from '../main/memory-gate-history.mjs';
import { Supervisor } from '../main/supervisor.mjs';

const dirs = [];
const servers = [];
afterEach(async () => {
  for (const s of servers.splice(0)) await s.stop();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const CODEX = { pid: 100, ppid: 1, mb: 300, args: '/Users/x/.local/bin/codex app-server' };
const CLAUDE = { pid: 200, ppid: 1, mb: 300, args: 'claude -p --output-format stream-json' };

function harness({ history = new CommandHistory(), slots = 2 } = {}) {
  const dir = fs.mkdtempSync(path.join('/tmp', 'gate-codex-turn-'));
  dirs.push(dir);
  let procs = [CODEX, CLAUDE];
  const old = Date.now() - 3_600_000;
  const aged = (p) => (p.startedAt !== undefined ? p : { ...p, startedAt: p === CODEX || p === CLAUDE ? old : Date.now() + 1_000 });
  procs = procs.map(aged);
  let now = 0;
  const server = new MemoryGateServer({
    socketPath: path.join(dir, 'g.sock'),
    history,
    ownerOf: (session) => ({ item: `w-${session}`, product: 'agentbox' }),
    readPressure: async () => ({ level: 1, freePct: 50 }),
    sampleProcesses: async () => procs,
    pollMs: 60_000,
    clock: () => now,
    gate: { slots },
  });
  servers.push(server);
  // A Codex command names its thread; a Claude one names its row.
  const codex = (id, command, session) => new Promise((resolve) => {
    const res = { end: (body) => resolve(body ?? ''), on: () => {} };
    server._pre({ ppid: CODEX.pid, score: 5, hook: { tool_use_id: id, session_id: session, tool_input: { command } } }, {}, res);
    setTimeout(() => resolve(null), 20);
  });
  const claude = (id, command) => new Promise((resolve) => {
    const res = { end: (body) => resolve(body ?? ''), on: () => {} };
    server._pre({ ppid: CLAUDE.pid, item: 'w-claude', product: 'agentbox', score: 5, hook: { tool_use_id: id, tool_input: { command } } }, {}, res);
    setTimeout(() => resolve(null), 20);
  });
  return {
    server, codex, claude,
    setProcs: (p) => { procs = p.map(aged); },
    advance: (ms) => { now += ms; },
    poll: () => server._poll(),
    status: () => server.status(),
  };
}

/** A test run under the app-server, as one Codex thread's command would start. */
const testRun = { pid: 301, ppid: CODEX.pid, mb: 1200, args: 'node vitest run' };

describe('two Codex commands measured as one figure', () => {
  it('hold one slot between them, so a Claude command still gets the other (the reported case)', async () => {
    const h = harness();
    await h.poll();
    expect(await h.codex('a', 'cat AGENTS.md', 'thread-a')).toBe('');
    expect(await h.codex('b', 'node scripts/check.mjs', 'thread-b')).toBe('');
    h.setProcs([CODEX, CLAUDE, testRun]);
    await h.poll();
    h.advance(60_000);
    await h.poll();
    // Both read as the test run's 1200 MB, and both are the same reading.
    expect(h.status().running.map((r) => r.peakMb)).toEqual([1200, 1200]);
    expect(await h.claude('c', 'cat ~/.agentbox/CLAUDE.md')).toBe('');
  });

  it('but not when there is no second slot to give', async () => {
    const h = harness({ slots: 1 });
    await h.poll();
    await h.codex('a', 'cat AGENTS.md', 'thread-a');
    await h.codex('b', 'node scripts/check.mjs', 'thread-b');
    h.setProcs([CODEX, CLAUDE, testRun]);
    await h.poll();
    h.advance(60_000);
    await h.poll();
    expect(await h.claude('c', 'cat ~/.agentbox/CLAUDE.md')).toBe(null);
  });

  it('a Codex command the history knows is heavy still holds a slot of its own', async () => {
    const history = new CommandHistory();
    history.record('npm test', { peakMb: 1200, durationMs: 60_000 });
    const h = harness({ history });
    await h.poll();
    expect(await h.codex('a', 'npm test', 'thread-a')).toBe('');
    expect(await h.codex('b', 'npm test', 'thread-b')).toBe('');
    h.setProcs([CODEX, CLAUDE, testRun]);
    await h.poll();
    expect(await h.claude('c', 'cat ~/.agentbox/CLAUDE.md')).toBe(null);
  });

  it('one Codex command alone is measured as its own, exactly as before', async () => {
    const h = harness({ slots: 1 });
    await h.poll();
    await h.codex('a', 'node scripts/check.mjs', 'thread-a');
    h.setProcs([CODEX, CLAUDE, testRun]);
    await h.poll();
    h.advance(60_000);
    await h.poll();
    expect(await h.claude('c', 'cat ~/.agentbox/CLAUDE.md')).toBe(null);
  });
});

describe('a Codex turn that ends', () => {
  it('lets go of every grant its thread still holds', async () => {
    const h = harness({ slots: 1 });
    await h.poll();
    // Failed, so Codex never sent the "after" report.
    await h.codex('a', 'node scripts/check.mjs', 'thread-a');
    h.setProcs([CODEX, CLAUDE, testRun]);
    await h.poll();
    expect(await h.claude('c', 'cat notes.md')).toBe(null);
    h.server.releaseSession('thread-a');
    expect(h.status().running.map((r) => r.id)).toEqual(['c']);
  });

  it('and nobody else\'s', async () => {
    const h = harness();
    await h.poll();
    await h.codex('a', 'node scripts/check.mjs', 'thread-a');
    await h.codex('b', 'node scripts/other.mjs', 'thread-b');
    h.server.releaseSession('thread-a');
    expect(h.status().running.map((r) => r.id)).toEqual(['b']);
    h.server.releaseSession('thread-unknown');
    h.server.releaseSession(null);
    expect(h.status().running.map((r) => r.id)).toEqual(['b']);
  });

  it('never lets go of a Claude worker\'s command, which names its row and not a thread', async () => {
    const h = harness();
    await h.poll();
    await h.claude('c', 'node scripts/check.mjs');
    h.server.releaseSession('w-claude');
    h.server.releaseSession(undefined);
    expect(h.status().running.map((r) => r.id)).toEqual(['c']);
  });

  it('is told by the supervisor when a Codex worker exits, and only then', () => {
    const released = [];
    const self = { _memoryGate: { releaseSession: (s) => released.push(s) } };
    const ended = (session) => Supervisor.prototype.memoryGateTurnEnded.call(self, session);
    ended({ engine: 'codex', sessionId: 'thread-a' });
    ended({ engine: 'claude', sessionId: 'claude-session' });
    ended({ engine: 'codex' });
    ended(null);
    Supervisor.prototype.memoryGateTurnEnded.call({ _memoryGate: null }, { engine: 'codex', sessionId: 'x' });
    expect(released).toEqual(['thread-a']);
  });

  it('the worker\'s exit handler is where it is told', () => {
    const src = fs.readFileSync(new URL('../main/supervisor.mjs', import.meta.url), 'utf8');
    const exit = src.slice(src.indexOf("child.on('exit', (code, signal, how) => {"));
    expect(exit.slice(0, 1500)).toContain('this.memoryGateTurnEnded(session)');
  });
});
