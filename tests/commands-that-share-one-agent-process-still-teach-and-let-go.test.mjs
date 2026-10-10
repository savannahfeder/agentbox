// COMMANDS THAT SHARE ONE AGENT PROCESS STILL TEACH, AND STILL LET GO — w-5601e99977.
//
// WHAT BROKE, found by reading main/memory-gate-server.mjs against this app's
// own gate logs of the evening of 2026-10-07 (one `codex app-server` carrying
// ten distinct threads at once, replaced about every twenty minutes) rather
// than by a live repro.
//
// A Claude Code worker is one process per work item, so a grant's "anchor" is
// its own and everything under it is its own. ONE `codex app-server` SERVES
// EVERY CODEX THREAD OF A LOGIN, so every Codex grant on this Mac finds the
// same anchor, and two of them at once were measured together. Two things
// followed from that, both wrong:
//
//   - `_sample` marks every grant sharing an anchor `ambiguous`, and `_post`
//     filed nothing at all for an ambiguous grant. With several Codex workers
//     that is the normal case, so Codex taught the learned history almost
//     nothing and rode on what Claude workers taught it. The memory reading is
//     shared; how long the command took is not, and a run that was over inside
//     QUICK_MS counts as light on its duration alone.
//
//   - Both backstops for a grant whose "after" report was lost needed
//     something the Codex shape never gives. `maxGrantMs` was only checked
//     while no anchor had been found, and the 30-second idle release needs
//     nothing of ours running under the anchor — but a sibling thread's work
//     keeps the shared app-server busy, so that reading never arrives. A lost
//     report therefore held one of only two heavy slots until the app-server
//     was replaced.
//
// So: an ambiguous grant files its duration and only a light verdict (filing
// "not measured" would un-learn a command this app has seen light before), and
// a grant whose end can never be observed is let go on the clock.

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { MemoryGateServer } from '../main/memory-gate-server.mjs';
import { CommandHistory } from '../main/memory-gate-history.mjs';

const dirs = [];
const servers = [];
afterEach(async () => {
  for (const s of servers.splice(0)) await s.stop();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

// The one app-server, and the MCP server it keeps for its whole life.
const CODEX = { pid: 100, ppid: 1, mb: 300, args: '/Users/x/.local/bin/codex app-server' };
const HELPER = { pid: 101, ppid: 100, mb: 80, args: 'node store-server.mjs' };

function harness({ history = new CommandHistory(), idleReleaseMs, sharedGrantMs, slots = 2 } = {}) {
  const dir = fs.mkdtempSync(path.join('/tmp', 'gate-shared-'));
  dirs.push(dir);
  let procs = [CODEX, HELPER];
  let now = 0;
  const server = new MemoryGateServer({
    socketPath: path.join(dir, 'g.sock'),
    history,
    // Every thread of this login is this app's, and each names its own row.
    ownerOf: (session) => ({ item: `w-${session}`, product: 'agentbox' }),
    readPressure: async () => ({ level: 1, freePct: 50 }),
    sampleProcesses: async () => procs,
    pollMs: 60_000,
    idleReleaseMs,
    sharedGrantMs,
    clock: () => now,
    gate: { slots },
  });
  servers.push(server);
  // Straight into the handler, as the socket would.
  const ask = (id, command, session = id) => new Promise((resolve) => {
    const res = { end: (body) => resolve(body), on: () => {} };
    server._pre({ ppid: CODEX.pid, score: 5, hook: { tool_use_id: id, session_id: session, tool_input: { command } } }, {}, res);
  });
  const post = (id, durationMs) => server._post({ hook: { tool_use_id: id, duration_ms: durationMs } });
  // Real `ps` readings carry a start time: the app-server and its helper are an
  // hour old, anything else started a moment from now.
  const aged = (p) => (p.startedAt !== undefined ? p
    : { ...p, startedAt: p.pid === CODEX.pid || p.pid === HELPER.pid ? Date.now() - 3_600_000 : Date.now() + 1_000 });
  procs = procs.map(aged);
  return {
    server, ask, post,
    setProcs: (p) => { procs = p.map(aged); },
    advance: (ms) => { now += ms; },
    poll: () => server._poll(),
    running: () => server.status().running,
  };
}

/** Two threads of one app-server, each running a command, measured together. */
async function bothAtOnce(h, round, a, b) {
  await h.ask(`a${round}`, a, `thread-a`);
  await h.ask(`b${round}`, b, `thread-b`);
  h.setProcs([CODEX, HELPER, { pid: 300 + round, ppid: CODEX.pid, mb: 40, args: a }]);
  await h.poll();
}

describe('what two commands on one app-server teach', () => {
  it('each files how long it took, so a quick one counts as light', async () => {
    const history = new CommandHistory();
    const h = harness({ history });
    await h.poll();
    for (const round of [0, 1]) {
      await bothAtOnce(h, round, 'rg needle', 'jq .');
      // Both are over well inside QUICK_MS, which is each command's own fact.
      h.post(`a${round}`, 400);
      h.post(`b${round}`, 900);
      h.setProcs([CODEX, HELPER]);
      await h.poll();
    }
    expect(history.classify('rg needle')).toBe('light');
    expect(history.classify('jq .')).toBe('light');
  });

  it('but claims no figure for the memory, which belonged to both of them', async () => {
    const history = new CommandHistory();
    const h = harness({ history });
    await h.poll();
    for (const round of [0, 1]) {
      await h.ask(`a${round}`, 'cargo build', 'thread-a');
      await h.ask(`b${round}`, 'rg needle', 'thread-b');
      // The gigabyte is `cargo build`'s; `rg needle` was next to it and is
      // measured at the same figure, which is the whole of the problem.
      h.setProcs([CODEX, HELPER, { pid: 300 + round, ppid: CODEX.pid, mb: 900, args: 'cargo build' }]);
      await h.poll();
      expect(h.running().map((r) => r.peakMb)).toEqual([900, 900]);
      h.post(`a${round}`, 400);
      h.post(`b${round}`, 400);
      h.setProcs([CODEX, HELPER]);
      await h.poll();
    }
    // Both were over in 400 ms, so both are light on their own duration, and
    // neither is filed heavy off a reading that was the two of them together.
    expect(history.classify('rg needle')).toBe('light');
    expect(history.classify('cargo build')).toBe('light');
  });

  it('a slow one teaches nothing, rather than un-learning a command seen light', async () => {
    const history = new CommandHistory();
    history.record('npm run build', { peakMb: 20, durationMs: 300 });
    history.record('npm run build', { peakMb: 20, durationMs: 300 });
    expect(history.classify('npm run build')).toBe('light');
    const h = harness({ history });
    await h.poll();
    await bothAtOnce(h, 0, 'npm run build', 'npm run build');
    h.post('a0', 60_000);
    h.post('b0', 60_000);
    expect(history.classify('npm run build')).toBe('light');
  });

  it('and a quick one sent to the background proves nothing, so it teaches nothing', async () => {
    const history = new CommandHistory();
    const h = harness({ history });
    await h.poll();
    const background = (id, command, session) => new Promise((resolve) => {
      const res = { end: (body) => resolve(body), on: () => {} };
      h.server._pre({
        ppid: CODEX.pid, score: 5,
        hook: { tool_use_id: id, session_id: session, tool_input: { command, run_in_background: true } },
      }, {}, res);
    });
    for (const round of [0, 1]) {
      await background(`a${round}`, 'npm run dev', 'thread-a');
      await background(`b${round}`, 'npm run watch', 'thread-b');
      h.setProcs([CODEX, HELPER, { pid: 300 + round, ppid: CODEX.pid, mb: 40, args: 'npm run dev' }]);
      await h.poll();
      // Its tool call returns at once while the server carries on running.
      h.post(`a${round}`, 50);
      h.post(`b${round}`, 50);
      h.setProcs([CODEX, HELPER]);
      await h.poll();
    }
    expect(history.classify('npm run dev')).toBe('unknown');
  });
});

describe('letting go of a slot on an app-server that is never empty', () => {
  it('a grant whose report was lost goes once it has held its slot too long', async () => {
    const history = new CommandHistory();
    history.record('npm test', { peakMb: 900 });
    const h = harness({ history, idleReleaseMs: 30_000, sharedGrantMs: 20 * 60_000 });
    await h.poll();
    await bothAtOnce(h, 0, 'npm test', 'npm test');
    // One thread reports back; the other's hook is killed and never does. The
    // app-server stays busy for the thread that carried on, so the idle
    // release will never see nothing running.
    h.post('b0', 1_000);
    for (let i = 0; i < 38; i++) {
      h.advance(30_000);
      h.setProcs([CODEX, HELPER, { pid: 400, ppid: CODEX.pid, mb: 900, args: 'node vitest' }]);
      await h.poll();
    }
    expect(h.running()).toHaveLength(1);
    h.advance(90_000);
    await h.poll();
    expect(h.running()).toHaveLength(0);
  });

  it('and the three-hour ceiling now covers a grant whose agent was found', async () => {
    const history = new CommandHistory();
    history.record('npm test', { peakMb: 900 });
    const h = harness({ history, idleReleaseMs: 30_000, slots: 1 });
    await h.poll();
    await h.ask('alone', 'npm test', 'thread-a');
    // Never ambiguous, and never idle either: something is always running
    // under the shared app-server.
    for (let i = 0; i < 35; i++) {
      h.advance(5 * 60_000);
      h.setProcs([CODEX, HELPER, { pid: 400, ppid: CODEX.pid, mb: 900, args: 'node vitest' }]);
      await h.poll();
    }
    expect(h.running()).toHaveLength(1);
    h.advance(20 * 60_000);
    await h.poll();
    expect(h.running()).toHaveLength(0);
  });

  it('a command of its own that reports back on time keeps its slot throughout', async () => {
    const history = new CommandHistory();
    history.record('npm test', { peakMb: 900 });
    const h = harness({ history, idleReleaseMs: 30_000, sharedGrantMs: 20 * 60_000, slots: 1 });
    await h.poll();
    await h.ask('mine', 'npm test', 'thread-a');
    for (let i = 0; i < 30; i++) {
      h.advance(30_000);
      h.setProcs([CODEX, HELPER, { pid: 400, ppid: CODEX.pid, mb: 900, args: 'node vitest' }]);
      await h.poll();
    }
    // Fifteen minutes in, alone on its anchor, still measured: still its slot.
    expect(h.running()).toHaveLength(1);
    expect(h.running()[0].peakMb).toBe(900);
    h.post('mine', 15 * 60_000);
    expect(h.running()).toHaveLength(0);
    expect(history.classify('npm test')).toBe('heavy');
  });
});
