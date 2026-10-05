// THE MEMORY GATE MEASURES EACH COMMAND BY ITS OWN PROCESSES — w-3958c3753d.
//
// WHAT THIS GUARDS. The coordinator learns which commands are heavy by looking
// at what they started, and releases a slot whose command is gone even when
// nobody told it so. Both were found the hard way while building it:
//   - a granted command whose "after" report never arrives (the hook was
//     killed, the agent crashed) held its slot for good, because a learned-heavy
//     command keeps its slot for its whole run;
//   - an agent's own long-lived helpers (its MCP servers) live under the same
//     process, and counting them would call every command heavy.
// So a command is measured as the processes that appeared under its agent
// after it was allowed, and a grant with nothing running under it for
// `idleReleaseMs` is let go. A grant whose agent process has died, or whose pid
// now belongs to another program (pid reuse after a restart), is let go at once.

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { MemoryGateServer, etimeSeconds } from '../main/memory-gate-server.mjs';
import { CommandHistory } from '../main/memory-gate-history.mjs';

const dirs = [];
const servers = [];
afterEach(async () => {
  for (const s of servers.splice(0)) await s.stop();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const CLAUDE = { pid: 100, ppid: 1, mb: 300, args: '/Users/x/.local/bin/claude -p --output-format stream-json' };
const MCP = { pid: 101, ppid: 100, mb: 80, args: 'node store-server.mjs' };

function harness({ history = new CommandHistory(), idleReleaseMs } = {}) {
  const dir = fs.mkdtempSync(path.join('/tmp', 'gate-'));
  dirs.push(dir);
  let procs = [CLAUDE, MCP];
  let now = 0;
  const server = new MemoryGateServer({
    socketPath: path.join(dir, 'g.sock'),
    history,
    readPressure: async () => ({ level: 1, freePct: 50 }),
    sampleProcesses: async () => procs,
    pollMs: 60_000,
    idleReleaseMs,
    clock: () => now,
    gate: { slots: 1 },
  });
  servers.push(server);
  // Drive requests straight in, as the HTTP handler would.
  const ask = (id, command) => new Promise((resolve) => {
    const res = { end: (body) => resolve(body), on: () => {} };
    server._pre({ ppid: CLAUDE.pid, score: 5, item: 'w-1', hook: { tool_use_id: id, tool_input: { command } } }, {}, res);
  });
  const post = (id, durationMs = 30_000) => server._post({ hook: { tool_use_id: id, duration_ms: durationMs } });
  // Real `ps` readings carry a start time. Here the agent and its helper are
  // an hour old and anything else started a moment from now, unless a test
  // says otherwise.
  const aged = (p) => (p.startedAt !== undefined ? p
    : { ...p, startedAt: p.pid === CLAUDE.pid || p.pid === MCP.pid ? Date.now() - 3_600_000 : Date.now() + 1_000 });
  procs = procs.map(aged);
  return {
    server, ask, post,
    setProcs: (p) => { procs = p.map(aged); },
    advance: (ms) => { now += ms; },
    poll: () => server._poll(),
  };
}

describe('what a command is measured as', () => {
  it('only the processes that appeared under its agent after it was allowed', async () => {
    const h = harness();
    await h.poll(); // the coordinator has seen the agent and its helper before anything runs
    await h.ask('t1', 'cargo build');
    h.setProcs([CLAUDE, MCP,
      { pid: 200, ppid: 100, mb: 5, args: '/bin/zsh -c cargo build' },
      { pid: 201, ppid: 200, mb: 700, args: 'cargo build' },
      { pid: 999, ppid: 1, mb: 4_000, args: 'Docker VM' }]);
    await h.poll();
    const r = h.server.status().running[0];
    expect(r.peakMb).toBe(705);
  });

  it('an agent\'s helpers that started before the command never count, even unseen until now', async () => {
    const h = harness();
    // No look at the processes before the command: a fresh agent's first call.
    const before = Date.now() - 60_000;
    await h.ask('t1', 'cargo build');
    const after = Date.now() + 500;
    h.setProcs([
      { ...CLAUDE, startedAt: before },
      { ...MCP, mb: 350, startedAt: before },
      { pid: 201, ppid: 100, mb: 700, args: 'cargo build', startedAt: after },
    ]);
    await h.poll();
    expect(h.server.status().running[0].peakMb).toBe(700);
  });

  it('teaches the history what the command used when it reports back', async () => {
    const history = new CommandHistory();
    const h = harness({ history });
    await h.poll();
    for (const id of ['a', 'b']) {
      await h.ask(id, 'cargo build');
      h.setProcs([CLAUDE, MCP, { pid: 300, ppid: 100, mb: 900, args: 'cargo build' }]);
      await h.poll();
      h.post(id);
      h.setProcs([CLAUDE, MCP]);
      await h.poll();
    }
    expect(history.classify('cargo build')).toBe('heavy');
  });

  it('two commands on one agent at once share the reading and teach nothing', async () => {
    const history = new CommandHistory();
    const h = harness({ history });
    h.server.gate.setSlots(2);
    await h.poll();
    await h.ask('a', 'cargo build');
    await h.ask('b', 'make all');
    h.setProcs([CLAUDE, MCP, { pid: 300, ppid: 100, mb: 900, args: 'cargo build' }]);
    await h.poll();
    expect(h.server.status().running.map((r) => r.peakMb)).toEqual([900, 900]);
    h.post('a'); h.post('b');
    expect(history.classify('cargo build')).toBe('unknown');
  });
});

describe('letting go of a slot nobody returned', () => {
  it('a learned-heavy command whose report never came is released once nothing runs under it', async () => {
    const history = new CommandHistory();
    history.record('npm test', { peakMb: 900 });
    const h = harness({ history, idleReleaseMs: 30_000 });
    await h.poll();
    await h.ask('lost', 'npm test');
    h.setProcs([CLAUDE, MCP, { pid: 400, ppid: 100, mb: 900, args: 'node vitest' }]);
    await h.poll();
    // The test ends, and its "after" report is lost.
    h.setProcs([CLAUDE, MCP]);
    await h.poll();
    h.advance(29_000); await h.poll();
    expect(h.server.status().running).toHaveLength(1);
    h.advance(2_000); await h.poll();
    expect(h.server.status().running).toHaveLength(0);
  });

  it('but never while something it started is still running', async () => {
    const history = new CommandHistory();
    history.record('npm test', { peakMb: 900 });
    const h = harness({ history, idleReleaseMs: 30_000 });
    await h.poll();
    await h.ask('long', 'npm test');
    h.setProcs([CLAUDE, MCP, { pid: 400, ppid: 100, mb: 900, args: 'node vitest' }]);
    for (let i = 0; i < 10; i++) { h.advance(10_000); await h.poll(); }
    expect(h.server.status().running).toHaveLength(1);
  });

  it('a command whose agent process died is released at once', async () => {
    const h = harness();
    await h.poll();
    await h.ask('t1', 'cargo build');
    await h.poll();
    h.setProcs([]);
    await h.poll();
    expect(h.server.status().running).toHaveLength(0);
  });

  it('a command whose agent was never found is released after three hours, and not before', async () => {
    const h = harness();
    // The hook's parent is a process that is already gone, so no agent is found.
    h.setProcs([]);
    await h.server._pre({ ppid: 4242, score: 5, hook: { tool_use_id: 'orphan', tool_input: { command: 'cargo build' } } }, {}, { end: () => {}, on: () => {} });
    h.advance(2 * 60 * 60_000); await h.poll();
    expect(h.server.status().running).toHaveLength(1);
    h.advance(61 * 60_000); await h.poll();
    expect(h.server.status().running).toHaveLength(0);
  });

  it('a pid that now belongs to some other program counts as the agent gone', async () => {
    const h = harness();
    await h.poll();
    await h.ask('t1', 'cargo build');
    await h.poll();
    h.setProcs([{ ...CLAUDE, args: '/usr/sbin/somethingelse' }]);
    await h.poll();
    expect(h.server.status().running).toHaveLength(0);
  });
});

describe('reading how long a process has run', () => {
  it('every shape ps prints, and nothing else', () => {
    expect(etimeSeconds('00:07')).toBe(7);
    expect(etimeSeconds('05:07')).toBe(307);
    expect(etimeSeconds('02:05:07')).toBe(7_507);
    expect(etimeSeconds('3-02:05:07')).toBe(266_707);
    expect(etimeSeconds('')).toBe(null);
    expect(etimeSeconds('7')).toBe(null);
  });
});
