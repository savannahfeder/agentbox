// AN ORDINARY READ REACHES THE SHELL, AND ANYTHING HELD IS TOLD WHY —
// w-8386b3fd47.
//
// WHAT BROKE. Two sessions reported the same thing on 2026-10-07: `cat`, `rg`,
// `git diff` and `sed` on files inside their own checkout simply never
// returned. No output, no denial, nothing in the engine's own logs. Both spent
// their whole turn narrating stalls and shipped nothing, and both filed it
// against the engine. It was this gate.
//
// Every command a worker runs asks the gate first
// (main/memory-gate-server.mjs), a command that is not LIGHT needs one of
// `slots` (two on a 16 GB machine), and the queue is one queue for every agent
// running. So an ordinary read that comes out `unknown` queues behind whatever
// build or test suite holds the slots, and after `maxWaitMs` it is refused.
//
// HOW IT WAS MEASURED. The live coordinator was asked for its status mid
// incident: pressure `normal`, 42% of memory free, both slots held (one by a
// real build, one by a command measured at 8 MB), and eight commands waiting,
// every one an ordinary read, every one `unknown`, the longest for 443 seconds.
// A plain file read from the investigating session was then held for the full
// twenty minutes and refused.
//
// WHY THEY WERE `unknown` is fixed on main and covered by
// `a-run-that-was-never-measured-does-not-make-a-command-heavy`: a `?` means a
// run nothing measured, and it was being counted against the command. This file
// does not repeat those rules. It pins the two things that reading those rules
// does not tell you.
//
// FIRST, THAT IT ACTUALLY REACHES THE SHELL. Classification is a pure function
// and was already tested as one; nothing asserted that a read the history calls
// light is admitted by the gate WHILE both slots are busy, which is the whole of
// what the two sessions lost their turns to. A light command takes no slot, so
// it must go straight through, and a command that really is unknown must still
// wait its turn behind the heavy work.
//
// SECOND, THAT A REFUSAL IS HONEST. The sentence a held command finally gets is
// the only account an agent ever has of why it did not run, and it blamed memory
// either way. Both sessions read it while the coordinator itself was reporting
// normal pressure and 42% free, believed the machine was out of memory, and went
// looking for a fault that was not there. A queue behind heavier work and a
// computer that is genuinely short are different things to be told.

import { describe, it, expect } from 'vitest';
import { CommandHistory } from '../main/memory-gate-history.mjs';
import { MemoryGate } from '../main/memory-gate.mjs';

/**
 * A history in which `cat` has been measured light often enough to lend that to
 * an argument it has not seen, with one run nothing measured among them. This is
 * the shape the real saved history had for `cat` when the incident was caught:
 * `llllll??ll`.
 */
const historyWhereCatIsLight = () => {
  const history = new CommandHistory();
  let n = 0;
  for (const letter of 'llllll??ll') {
    const command = `cat file${n++}.ts`;
    if (letter === 'l') history.record(command, { peakMb: 20 });
    else history.record(command, { peakMb: null, durationMs: 30_000 });
  }
  return history;
};

/** Two commands nobody has ever seen, which is enough to hold both slots. */
const fillBothSlots = (gate) => {
  gate.submit({ id: 'build-one', command: 'mystery-one x' }, () => {});
  gate.submit({ id: 'build-two', command: 'mystery-two x' }, () => {});
};

describe('a read the gate knows is light', () => {
  it('goes straight through while both slots are busy', () => {
    const gate = new MemoryGate({ history: historyWhereCatIsLight(), slots: 2 });
    fillBothSlots(gate);

    let answered = null;
    gate.submit({ id: 'the-read', command: 'cat renderer/src/api.ts' }, (d) => { answered = d; });
    expect(answered).toEqual({ allow: true, cls: 'light' });
  });

  it('and so does the next eight, because the light lane is its own', () => {
    const gate = new MemoryGate({ history: historyWhereCatIsLight(), slots: 2 });
    fillBothSlots(gate);

    const allowed = [];
    for (let i = 0; i < 8; i++) {
      gate.submit({ id: `read-${i}`, command: `cat src/file${i}.ts` }, (d) => { allowed.push(d.allow); });
    }
    expect(allowed).toEqual([true, true, true, true, true, true, true, true]);
  });

  it('while a command that really is unknown still waits its turn', () => {
    const gate = new MemoryGate({ history: historyWhereCatIsLight(), slots: 2 });
    fillBothSlots(gate);

    let answered = null;
    gate.submit({ id: 'third', command: 'mystery-three x' }, (d) => { answered = d; });
    expect(answered).toBe(null);
  });

  it('and a command measured heavy is not let through by its program', () => {
    const history = historyWhereCatIsLight();
    history.record('cat enormous.bin', { peakMb: 900 });
    const gate = new MemoryGate({ history, slots: 2 });
    fillBothSlots(gate);

    let answered = null;
    gate.submit({ id: 'the-big-one', command: 'cat enormous.bin' }, (d) => { answered = d; });
    expect(answered).toBe(null);
  });
});

describe('a refusal says which of the two reasons it was', () => {
  const refusedAfterWaiting = (setUp) => {
    let now = 0;
    const gate = new MemoryGate({ maxWaitMs: 60_000, slots: 1, clock: () => now });
    setUp(gate);
    let reason = null;
    gate.submit({ id: 'waits', command: 'mystery-two x' }, (d) => { if (!d.allow) reason = d.reason; });
    now = 120_000;
    gate.tick();
    return reason;
  };

  it('names the wait for heavier work while memory is normal', () => {
    const reason = refusedAfterWaiting((gate) => {
      gate.submit({ id: 'holds', command: 'mystery-one x' }, () => {});
    });
    expect(reason).toMatch(/heavier work/);
    expect(reason).not.toMatch(/short of memory/);
  });

  it('and says memory is short only when it is', () => {
    const reason = refusedAfterWaiting((gate) => gate.setPressure('tight'));
    expect(reason).toMatch(/short of memory/);
  });

  it('either way it tells the agent what to do instead, once', () => {
    const reason = refusedAfterWaiting((gate) => gate.setPressure('tight'));
    expect(reason).toMatch(/Do not retry it straight away/);
    expect(reason).toMatch(/end your turn and say what you are waiting for/);
  });
});
