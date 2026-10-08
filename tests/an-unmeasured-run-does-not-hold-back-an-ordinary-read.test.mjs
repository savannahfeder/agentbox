// AN ORDINARY READ IS NOT HELD BEHIND HEAVY WORK BECAUSE ONE RUN WENT
// UNMEASURED — w-8386b3fd47.
//
// WHAT BROKE. Two sessions reported the same thing on 2026-10-07: `cat`, `rg`,
// `git diff` and `sed` on files inside their own checkout simply never
// returned. No output, no denial, nothing in the engine's own logs. Both
// sessions spent their whole turn narrating stalls and shipped nothing, and
// both filed it against the engine.
//
// It was this gate. Every command a worker runs asks it first
// (main/memory-gate-server.mjs), a command that is not LIGHT needs one of
// `slots` (two on a 16 GB Mac), and the queue is one queue for every agent on
// the machine. So an ordinary read that comes out `unknown` queues behind
// whatever build or test suite holds the slots, and after `maxWaitMs` it is
// refused outright.
//
// HOW IT WAS MEASURED. The live coordinator was asked for its status mid
// incident: pressure `normal`, 42% of memory free, both slots held (one by a
// real build, one by a command measured at 8 MB), and eight commands waiting,
// every one of them an ordinary read, every one of them `unknown`, the longest
// for 443 seconds. A plain file read from this very session was then held for
// the full twenty minutes and refused.
//
// WHY THEY WERE `unknown`. The gate's own saved history had the answer. The
// programs those reads use had been measured light almost every time, but not
// quite every time:
//
//     cat  llllll??ll      git  llllll????      rg  lllllllll?
//     ls   ?ll?llllll      awk  ll?lllllll      tail llllllll?l
//
// A `?` is "this run was never measured" — it finished between two samples and
// ran longer than the quick threshold, so nothing was learned either way. The
// program fallback asked for the last ten to be light with no exceptions, so a
// single `?` took `cat` out of the light lane for its next ten runs, and the
// same at the key level, where any one observation that was not light made the
// command unknown and skipped the fallback entirely.
//
// That reads missing evidence as evidence AGAINST. The rule this file defends is
// the one memory-gate-history.mjs states: missing evidence never makes a command
// light. It must not make one heavy either. A `?` counts for nothing and is
// skipped; the positive thresholds still have to be met by runs that were
// actually measured, and one measured heavy or middling run still counts.

import { describe, it, expect } from 'vitest';
import { CommandHistory } from '../main/memory-gate-history.mjs';
import { MemoryGate } from '../main/memory-gate.mjs';

/**
 * Give `program` one run per letter, each on an argument of its own so the
 * per-key history stays short and a NEW argument has to go through the
 * program fallback. l light, m between, h heavy, ? never measured.
 */
const runs = (history, program, letters) => {
  let n = 0;
  for (const letter of letters) {
    const command = `${program} arg${n++}`;
    if (letter === 'l') history.record(command, { peakMb: 20 });
    else if (letter === 'm') history.record(command, { peakMb: 250 });
    else if (letter === 'h') history.record(command, { peakMb: 900 });
    else history.record(command, { peakMb: null, durationMs: 30_000 });
  }
};

describe('a run nobody measured counts for nothing, not against', () => {
  it('the reported case: one unmeasured run does not stop cat lending light', () => {
    const h = new CommandHistory();
    runs(h, 'cat', 'llllll??ll');
    expect(h.classify('cat renderer/src/api.ts')).toBe('light');
  });

  it('five measured light runs are enough, however many went unmeasured', () => {
    const h = new CommandHistory();
    runs(h, 'rg', 'l?l?l?l?l?');
    expect(h.classify('rg something-new src')).toBe('light');
  });

  it('but four are not: the threshold is counted in runs that were measured', () => {
    const h = new CommandHistory();
    runs(h, 'awk', 'l?l?l?l?');
    expect(h.classify('awk NR==1 notes.txt')).toBe('unknown');
  });

  it('a key seen light twice is light with an unmeasured run in between', () => {
    const h = new CommandHistory();
    h.record('jq . a.json', { peakMb: null, durationMs: 400 });
    h.record('jq . a.json', { peakMb: null, durationMs: 30_000 });
    h.record('jq . a.json', { peakMb: 20 });
    expect(h.classify('jq . a.json')).toBe('light');
  });

  it('a single unmeasured run leaves the program fallback free to answer', () => {
    const h = new CommandHistory();
    runs(h, 'head', 'llllll');
    h.record('head -n 5 big.log', { peakMb: null, durationMs: 30_000 });
    expect(h.classify('head -n 5 big.log')).toBe('light');
  });
});

describe('what must still not come out light', () => {
  it('a program measured heavy once, among nine other runs', () => {
    const h = new CommandHistory();
    runs(h, 'python3', 'llllllll?h');
    expect(h.classify('python3 brand-new.py')).toBe('unknown');
  });

  it('a program whose measured runs sit between light and heavy', () => {
    const h = new CommandHistory();
    runs(h, 'node', 'lllllmmmm?');
    expect(h.classify('node build.mjs')).toBe('unknown');
  });

  it('a key measured heavy stays heavy when a later run goes unmeasured', () => {
    const h = new CommandHistory();
    h.record('npm test', { peakMb: 900 });
    h.record('npm test', { peakMb: null, durationMs: 30_000 });
    expect(h.classify('npm test')).toBe('heavy');
  });

  it('a program nobody has measured at all', () => {
    const h = new CommandHistory();
    runs(h, 'cargo', '??????????');
    expect(h.classify('cargo build')).toBe('unknown');
  });
});

describe('and so the read is not held behind the heavy work', () => {
  it('goes straight through while both slots are busy', () => {
    const history = new CommandHistory();
    runs(history, 'cat', 'llllll??ll');
    const gate = new MemoryGate({ history, slots: 2 });

    // Two commands nobody has seen take both of the heavy slots.
    gate.submit({ id: 'build-one', command: 'mystery-one x' }, () => {});
    gate.submit({ id: 'build-two', command: 'mystery-two x' }, () => {});

    let answered = null;
    gate.submit({ id: 'the-read', command: 'cat renderer/src/api.ts' }, (d) => { answered = d; });
    expect(answered).toEqual({ allow: true, cls: 'light' });
  });

  it('while a command that really is unknown still waits its turn', () => {
    const history = new CommandHistory();
    runs(history, 'cat', 'llllll??ll');
    const gate = new MemoryGate({ history, slots: 2 });
    gate.submit({ id: 'build-one', command: 'mystery-one x' }, () => {});
    gate.submit({ id: 'build-two', command: 'mystery-two x' }, () => {});

    let answered = null;
    gate.submit({ id: 'third', command: 'mystery-three x' }, (d) => { answered = d; });
    expect(answered).toBe(null);
  });
});

describe('a refusal says what actually happened', () => {
  it('names the wait for heavier work while memory is normal', () => {
    let now = 0;
    const gate = new MemoryGate({ maxWaitMs: 60_000, slots: 1, clock: () => now });
    gate.submit({ id: 'holds', command: 'mystery-one x' }, () => {});
    let reason = null;
    gate.submit({ id: 'waits', command: 'mystery-two x' }, (d) => { if (!d.allow) reason = d.reason; });
    now = 120_000;
    gate.tick();
    expect(reason).toMatch(/heavier work/);
    expect(reason).not.toMatch(/short of memory/);
  });

  it('and says memory is short only when it is', () => {
    let now = 0;
    const gate = new MemoryGate({ maxWaitMs: 60_000, slots: 1, clock: () => now });
    gate.setPressure('tight');
    let reason = null;
    gate.submit({ id: 'waits', command: 'mystery-two x' }, (d) => { if (!d.allow) reason = d.reason; });
    now = 120_000;
    gate.tick();
    expect(reason).toMatch(/short of memory/);
  });
});
