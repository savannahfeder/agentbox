// HEAVY COMMANDS WAIT THEIR TURN WHEN MEMORY IS SHORT — w-3958c3753d.
//
// WHAT BROKE. On a 16 GB M4 the founder could run three or four agents before
// the Mac fell over: swap reached 10.6 GB of 11.3, load average 180 on ten
// cores (measured 2026-10-04). An agent waiting on the model costs 220-340 MB;
// one running a test suite or a build passes a gigabyte. So the limit was never
// how many agents are open, it was how many heavy commands run at the same time.
//
// WHAT THIS PINS. The decision every command waits on, with no I/O: which
// command may start now, which waits, in what order, and when waiting ends.
// The rules were agreed with Codex over five rounds before a line was written:
//   - a command known to be light goes at once, unless memory is critical;
//   - a heavy or never-seen command needs one of a few slots, and only while
//     memory is normal;
//   - waiting commands go in the app's own order (urgent first), and nothing
//     lower slips past a higher one that is waiting for a slot;
//   - a running command is never stopped, and no command waits forever.

import { describe, it, expect } from 'vitest';
import { MemoryGate, pressureFrom, autoSlots } from '../main/memory-gate.mjs';
import { CommandHistory } from '../main/memory-gate-history.mjs';

const URGENT = 9, HIGH = 7, MEDIUM = 5, LOW = 2;

/** A gate on a fake clock, with a history that already knows a few commands. */
function makeGate(opts = {}) {
  let now = 0;
  const history = new CommandHistory();
  // `rg` and `git status` have been seen light many times; `npm test` heavy.
  for (let i = 0; i < 6; i++) {
    history.record('rg needle src', { peakMb: 20, durationMs: 300 });
    history.record('git status', { peakMb: 15, durationMs: 200 });
    history.record('npm test', { peakMb: 900, durationMs: 60_000 });
  }
  const gate = new MemoryGate({ slots: 2, history, clock: () => now, ...opts });
  const replies = new Map();
  const ask = (id, command, score = MEDIUM) => {
    replies.set(id, []);
    gate.submit({ id, command, score, item: `w-${id}` }, (d) => replies.get(id).push(d));
  };
  const state = (id) => {
    const r = replies.get(id);
    if (!r.length) return 'waiting';
    return r[0].allow ? 'running' : 'refused';
  };
  return { gate, ask, state, replies, advance: (ms) => { now += ms; gate.tick(); } };
}

describe('a light command', () => {
  it('starts at once even when every slot is taken', () => {
    const { ask, state } = makeGate();
    ask('a', 'npm test'); ask('b', 'npm test');
    ask('c', 'rg needle src');
    expect([state('a'), state('b'), state('c')]).toEqual(['running', 'running', 'running']);
  });

  it('still starts when memory is tight', () => {
    const { gate, ask, state } = makeGate();
    gate.setPressure('tight');
    ask('a', 'git status');
    expect(state('a')).toBe('running');
  });

  it('waits when memory is critical', () => {
    const { gate, ask, state } = makeGate();
    gate.setPressure('critical');
    ask('a', 'git status');
    expect(state('a')).toBe('waiting');
    gate.setPressure('normal');
    expect(state('a')).toBe('running');
  });
});

describe('a heavy or never-seen command', () => {
  it('takes a slot, and the one past the last slot waits for a finish', () => {
    const { gate, ask, state } = makeGate();
    ask('a', 'npm test'); ask('b', 'python train.py'); ask('c', 'cargo build');
    expect([state('a'), state('b'), state('c')]).toEqual(['running', 'running', 'waiting']);
    gate.finish('a');
    expect(state('c')).toBe('running');
  });

  it('waits when memory is tight, even with a slot free, and goes when it recovers', () => {
    const { gate, ask, state } = makeGate();
    gate.setPressure('tight');
    ask('a', 'npm test');
    expect(state('a')).toBe('waiting');
    gate.setPressure('normal');
    expect(state('a')).toBe('running');
  });

  it('gives its slot back once it has run a while and stayed small', () => {
    const { gate, ask, state, advance } = makeGate();
    ask('a', 'python serve.py'); ask('b', 'node watch.mjs'); ask('c', 'cargo build');
    expect(state('c')).toBe('waiting');
    gate.observe('a', 40); gate.observe('b', 60);
    advance(11_000);
    expect(state('c')).toBe('running');
  });

  it('keeps its slot while it is measured big', () => {
    const { gate, ask, state, advance } = makeGate();
    ask('a', 'python train.py'); ask('b', 'node build.mjs'); ask('c', 'cargo build');
    gate.observe('a', 2_500); gate.observe('b', 800);
    advance(60_000);
    expect(state('c')).toBe('waiting');
  });

  it('a command learned heavy holds its slot for its whole run, small or not', () => {
    const { gate, ask, state, advance } = makeGate();
    ask('a', 'npm test'); ask('b', 'npm test'); ask('c', 'cargo build');
    gate.observe('a', 10); gate.observe('b', 10);
    advance(120_000);
    expect(state('c')).toBe('waiting');
  });
});

describe('who goes first', () => {
  it('urgent before high before low, whatever order they arrived in', () => {
    const { gate, ask, state } = makeGate({ slots: 1 });
    ask('first', 'npm test', MEDIUM);
    ask('low', 'cargo build', LOW);
    ask('high', 'cargo build', HIGH);
    ask('urgent', 'cargo build', URGENT);
    gate.finish('first');
    expect(state('urgent')).toBe('running');
    expect([state('high'), state('low')]).toEqual(['waiting', 'waiting']);
    gate.finish('urgent');
    expect(state('high')).toBe('running');
    expect(state('low')).toBe('waiting');
  });

  it('a project above another outranks its urgent work, as the queue already does', () => {
    const { gate, ask, state } = makeGate({ slots: 1 });
    ask('first', 'npm test');
    ask('lower-project-urgent', 'cargo build', 100 + URGENT);
    ask('top-project-medium', 'cargo build', 200 + MEDIUM);
    gate.finish('first');
    expect(state('top-project-medium')).toBe('running');
    expect(state('lower-project-urgent')).toBe('waiting');
  });

  it('nothing lower slips past a higher command waiting for a slot', () => {
    const { gate, ask, state } = makeGate({ slots: 2 });
    ask('a', 'npm test', LOW); ask('b', 'npm test', LOW);
    ask('urgent', 'cargo build', URGENT);
    ask('low', 'make all', LOW);
    gate.finish('a');
    expect(state('urgent')).toBe('running');
    expect(state('low')).toBe('waiting');
  });

  it('but a light command from a lower task is never held behind it', () => {
    const { ask, state } = makeGate({ slots: 1 });
    ask('a', 'npm test', LOW);
    ask('urgent', 'cargo build', URGENT);
    ask('low-light', 'git status', LOW);
    expect(state('urgent')).toBe('waiting');
    expect(state('low-light')).toBe('running');
  });

  it('a command that has waited long enough moves up one level', () => {
    const { gate, ask, state, advance } = makeGate({ slots: 1, agingMs: 5 * 60_000 });
    ask('a', 'npm test');
    ask('old-medium', 'cargo build', MEDIUM);
    advance(15 * 60_000); // three levels of aging: 5 + 3 = 8
    ask('new-high', 'cargo build', HIGH);
    gate.finish('a');
    expect(state('old-medium')).toBe('running');
    expect(state('new-high')).toBe('waiting');
  });
});

describe('waiting ends', () => {
  it('with a refusal that says why, after the longest wait, and the agent hears once', () => {
    const { ask, state, replies, advance } = makeGate({ slots: 1, maxWaitMs: 20 * 60_000 });
    ask('a', 'npm test');
    ask('b', 'cargo build');
    advance(19 * 60_000);
    expect(state('b')).toBe('waiting');
    advance(61_000);
    expect(state('b')).toBe('refused');
    expect(replies.get('b')[0].reason).toMatch(/memory/i);
    advance(60_000);
    expect(replies.get('b')).toHaveLength(1);
  });

  it('a finish for a command it never saw, or a second finish, changes nothing', () => {
    const { gate, ask, state } = makeGate({ slots: 1 });
    ask('a', 'npm test'); ask('b', 'cargo build');
    gate.finish('nobody');
    expect(state('b')).toBe('waiting');
    gate.finish('a'); gate.finish('a');
    expect(state('b')).toBe('running');
    ask('c', 'make all');
    expect(state('c')).toBe('waiting');
  });

  it('raising the number of slots lets a waiting command go at once', () => {
    const { gate, ask, state } = makeGate({ slots: 1 });
    ask('a', 'npm test'); ask('b', 'cargo build');
    gate.setSlots(2);
    expect(state('b')).toBe('running');
  });

  it('the same id asked twice is answered once, and holds one slot', () => {
    const { gate, replies } = makeGate({ slots: 1 });
    const got = [];
    gate.submit({ id: 'x', command: 'npm test', score: 5 }, (d) => got.push(d));
    gate.submit({ id: 'x', command: 'npm test', score: 5 }, (d) => got.push(d));
    expect(got).toHaveLength(2);
    expect(gate.snapshot().running).toHaveLength(1);
    expect(replies.size).toBe(0);
  });
});

describe('reading the Mac', () => {
  it('turns the kernel pressure level and free memory into normal, tight or critical', () => {
    expect(pressureFrom({ level: 1, freePct: 40 })).toBe('normal');
    expect(pressureFrom({ level: 2, freePct: 40 })).toBe('tight');
    expect(pressureFrom({ level: 4, freePct: 40 })).toBe('critical');
    expect(pressureFrom({ level: 1, freePct: 11 })).toBe('tight');
    expect(pressureFrom({ level: 1, freePct: 12 })).toBe('normal');
    expect(pressureFrom({ level: 1, freePct: 4 })).toBe('critical');
    // A Mac it could not read is treated as fine: the gate then only orders
    // work by slots, which is what it did before it could read anything.
    expect(pressureFrom({ level: null, freePct: null })).toBe('normal');
  });

  it('offers one heavy slot per 8 GB, never fewer than one', () => {
    const gb = (n) => n * 1024 ** 3;
    expect(autoSlots(gb(8))).toBe(1);
    expect(autoSlots(gb(16))).toBe(2);
    expect(autoSlots(gb(36))).toBe(4);
    expect(autoSlots(gb(64))).toBe(8);
    expect(autoSlots(gb(4))).toBe(1);
    expect(autoSlots(0)).toBe(2);
  });
});
