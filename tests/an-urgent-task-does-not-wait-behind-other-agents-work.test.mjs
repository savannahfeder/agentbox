// AN URGENT TASK DOES NOT WAIT BEHIND OTHER AGENTS' WORK — w-713aba0c89.
//
// WHAT BROKE, measured off the session logs of 2026-10-07. The only Urgent row
// on the Mac ("Get task deployed", w-fecd1d315e) asked to run
// `cat ~/.agentbox/CLAUDE.md` at 21:05:11 and was still waiting at 21:20:13,
// when her own "status?" reply cancelled it. Its next command waited from 21:20
// to 21:27 the same way. Across every worker that evening 132 of 668 shell
// commands waited a minute or more, and every waiting one was released inside
// two seconds of each other at 21:39:44.
//
// Urgent WAS honoured, and that was the trouble: it is a place in the queue,
// and the queue only moves when a heavy slot comes free. Both slots were held
// for 34 minutes (by Codex commands sharing one app-server; see
// a-codex-turn-that-ends-gives-back-its-memory-slots.test.mjs), so first in
// line meant nothing. Her words: "this was the only urgent task I believe so it
// should have run regardless?"
//
// So an Urgent row's command no longer waits for a slot, and no longer waits
// while memory is merely tight. It still waits when memory is CRITICAL, because
// that is the Mac about to swap, and a running command is never stopped.
// Urgent is hers alone: `isUrgent` ignores a number an agent wrote, and the
// worker's own request cannot claim it.

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { MemoryGate } from '../main/memory-gate.mjs';
import { MemoryGateServer } from '../main/memory-gate-server.mjs';
import { CommandHistory } from '../main/memory-gate-history.mjs';
import { Supervisor } from '../main/supervisor.mjs';

const history = () => {
  const h = new CommandHistory();
  // `npm test` is heavy on this Mac: one measured run at a gigabyte.
  h.record('npm test', { peakMb: 1200, durationMs: 60_000 });
  return h;
};

/** A gate with both slots taken by two heavy commands that are still running. */
function busy({ pressure = 'normal' } = {}) {
  const gate = new MemoryGate({ history: history(), clock: () => 0, slots: 2 });
  for (const id of ['h1', 'h2']) gate.submit({ id, command: 'npm test', score: 5 }, () => {});
  expect(gate.snapshot().running.length).toBe(2);
  gate.setPressure(pressure);
  return gate;
}

const ask = (gate, req) => {
  let answer = null;
  gate.submit(req, (a) => { answer = a; });
  return () => answer;
};

describe('an urgent row while both slots are held', () => {
  it('runs a command nobody has measured at once (the reported case)', () => {
    const gate = busy();
    const answer = ask(gate, { id: 'u', command: 'cat ~/.agentbox/CLAUDE.md', score: 809, urgent: true });
    expect(answer()).toEqual({ allow: true, cls: 'unknown' });
  });

  it('runs a heavy command at once too', () => {
    const gate = busy();
    const answer = ask(gate, { id: 'u', command: 'npm test', score: 809, urgent: true });
    expect(answer()?.allow).toBe(true);
  });

  it('runs while memory is tight, which holds every other heavy command', () => {
    const gate = busy({ pressure: 'tight' });
    expect(ask(gate, { id: 'u', command: 'npm test', score: 809, urgent: true })()?.allow).toBe(true);
  });

  it('still waits while memory is critical, and runs the moment it is not', () => {
    const gate = busy({ pressure: 'critical' });
    const answer = ask(gate, { id: 'u', command: 'npm test', score: 809, urgent: true });
    expect(answer()).toBe(null);
    gate.setPressure('tight');
    expect(answer()?.allow).toBe(true);
  });
});

describe('what urgent does not change', () => {
  it('a High row with the best score still waits its turn for a slot', () => {
    const gate = busy();
    const answer = ask(gate, { id: 'hi', command: 'cat notes.md', score: 999 });
    expect(answer()).toBe(null);
    expect(gate.snapshot().waiting.map((w) => w.id)).toEqual(['hi']);
  });

  it('an urgent command that runs takes a slot, so the next ordinary one waits', () => {
    const gate = new MemoryGate({ history: history(), clock: () => 0, slots: 2 });
    gate.submit({ id: 'h1', command: 'npm test', score: 5 }, () => {});
    expect(ask(gate, { id: 'u', command: 'npm test', score: 809, urgent: true })()?.allow).toBe(true);
    expect(ask(gate, { id: 'next', command: 'npm test', score: 5 })()).toBe(null);
  });

  it('a light command was never held behind slots in the first place', () => {
    const h = history();
    h.record('git status', { peakMb: 10, durationMs: 100 });
    h.record('git status', { peakMb: 10, durationMs: 100 });
    const gate = new MemoryGate({ history: h, clock: () => 0, slots: 1 });
    gate.submit({ id: 'h1', command: 'npm test', score: 5 }, () => {});
    expect(ask(gate, { id: 'g', command: 'git status', score: 5 })()?.allow).toBe(true);
  });
});

describe('who decides a command is urgent', () => {
  const dirs = [];
  const servers = [];
  afterEach(async () => {
    for (const s of servers.splice(0)) await s.stop();
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  function server(urgentFor) {
    const dir = fs.mkdtempSync(path.join('/tmp', 'gate-urgent-'));
    dirs.push(dir);
    const s = new MemoryGateServer({
      socketPath: path.join(dir, 'g.sock'),
      history: history(),
      readPressure: async () => ({ level: 1, freePct: 50 }),
      sampleProcesses: async () => [],
      pollMs: 60_000,
      clock: () => 0,
      gate: { slots: 1 },
      urgentFor,
    });
    servers.push(s);
    const ask = (id, item, extra = {}) => new Promise((resolve) => {
      const res = { end: (body) => resolve(body ?? ''), on: () => {} };
      s._pre({ item, product: 'agentbox', score: 5, ppid: 1, ...extra, hook: { tool_use_id: id, tool_input: { command: 'npm test' } } }, {}, res);
      setTimeout(() => resolve(null), 20);
    });
    return { s, ask };
  }

  it('the app, from the row as it is now', async () => {
    const asked = [];
    const { ask } = server((product, item) => { asked.push([product, item]); return item === 'w-urgent'; });
    expect(await ask('h1', 'w-other')).toBe('');
    expect(await ask('u', 'w-urgent')).toBe('');
    expect(asked).toEqual([['agentbox', 'w-other'], ['agentbox', 'w-urgent']]);
  });

  it('never the worker: a request that calls itself urgent still waits', async () => {
    const { ask } = server(() => false);
    expect(await ask('h1', 'w-a')).toBe('');
    expect(await ask('sneaky', 'w-b', { urgent: true })).toBe(null);
  });

  it('a lookup that throws is not urgent, and does not stop the command being asked', async () => {
    const { s, ask } = server(() => { throw new Error('store mid-write'); });
    expect(await ask('h1', 'w-a')).toBe('');
    expect(await ask('u', 'w-b')).toBe(null);
    expect(s.status().waiting.map((w) => w.id)).toEqual(['u']);
  });

  it('the supervisor answers from her priority, not from a number an agent wrote', () => {
    const rows = {
      'w-hers': { id: 'w-hers', priority: 9, wrote: { priority: { source: 'founder' } } },
      'w-high': { id: 'w-high', priority: 7, wrote: { priority: { source: 'founder' } } },
      'w-agent': { id: 'w-agent', priority: 9, wrote: { priority: { source: 'agent' } } },
    };
    const self = { store: { readItem: (product, id) => rows[id] ?? null } };
    const urgent = (id) => Supervisor.prototype.memoryGateUrgent.call(self, 'agentbox', id);
    expect(urgent('w-hers')).toBe(true);
    expect(urgent('w-high')).toBe(false);
    expect(urgent('w-agent')).toBe(false);
    expect(urgent('w-gone')).toBe(false);
    expect(Supervisor.prototype.memoryGateUrgent.call({ store: { readItem: () => { throw new Error('x'); } } }, 'agentbox', 'w-hers')).toBe(false);
  });
});
