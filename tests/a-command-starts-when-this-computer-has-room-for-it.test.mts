// A COMMAND STARTS WHEN THIS COMPUTER HAS ROOM FOR IT.
//
// What broke: on 23 November 2026 at 14:54 Agentbox stood 291 MB inside its
// memory allowance (4,166 of 4,457 MB). A test run started, then at 14:57 a
// copy of the app that takes 1.4 GB, and by then it was 2.2 GB over and the
// Mac was short for the next ten minutes. Nothing held either one. The gate
// asked whether Agentbox was already over, never whether what was about to
// start would fit, and it counted commands in slots, two to a 16 GB Mac,
// whatever they took. Once over, it held every command it had not seen
// before: a Python line that read one file waited 20 minutes and was refused,
// one of nine that week, and of the commands that had waited a minute or
// more, four in five then took under 150 MB.
//
// Now the gate is told how much room Agentbox has on this computer
// (main/memory-allowance.mts measures it each minute) and knows what each
// command took here before (main/memory-gate-history.mts). A command starts
// when that fits, counting what the commands already running may still take.
// One that does not fit waits its turn, one at a time. With no room at all,
// what is known to be big waits, and a command nothing has measured is tried
// one at a time, because its size is not known to be big. A light command
// never waits for room, and the computer's own word that it is short still
// holds everything that is not light, as before.
import { describe, expect, it } from 'vitest';
import { MemoryGate, refusal } from '../main/memory-gate.mts';
import { CommandHistory } from '../main/memory-gate-history.mts';
import type { GateAnswer } from '../main/memory-gate.mts';

/** A gate on a fake clock that knows a 900 MB test run, a 300 MB script and two light commands. */
function makeGate(opts = {}) {
  let now = 1_000_000;
  const history = new CommandHistory();
  for (let i = 0; i < 6; i++) {
    history.record('rg needle src', { peakMb: 20, durationMs: 300 });
    history.record('git status', { peakMb: 15, durationMs: 200 });
    history.record('npm test', { peakMb: 900, durationMs: 60_000 });
    history.record('node build.mjs', { peakMb: 300, durationMs: 20_000 });
  }
  const gate = new MemoryGate({ slots: 2, history, clock: () => now, ...opts });
  const replies = new Map<string, GateAnswer[]>();
  const ask = (id: string, command: string, more = {}) => {
    replies.set(id, []);
    gate.submit({ id, command, score: 5, item: `w-${id}`, ...more }, (d) => replies.get(id)!.push(d));
  };
  const state = (id: string) => {
    const r = replies.get(id)!;
    if (!r.length) return 'waiting';
    return r[0].allow ? 'running' : 'refused';
  };
  return { gate, ask, state, replies, now: () => now, advance: (ms: number) => { now += ms; gate.tick(); } };
}

describe('with room for it', () => {
  it('two test runs start together when both fit', () => {
    const { gate, ask, state } = makeGate();
    gate.setRoom(3_000);
    ask('a', 'npm test'); ask('b', 'npm test');
    expect([state('a'), state('b')]).toEqual(['running', 'running']);
  });

  it('exactly enough is enough, and one megabyte less is not', () => {
    const fits = makeGate();
    fits.gate.setRoom(1_800);
    fits.ask('a', 'npm test'); fits.ask('b', 'npm test');
    expect([fits.state('a'), fits.state('b')]).toEqual(['running', 'running']);
    const short = makeGate();
    short.gate.setRoom(1_799);
    short.ask('a', 'npm test'); short.ask('b', 'npm test');
    expect([short.state('a'), short.state('b')]).toEqual(['running', 'waiting']);
  });

  it('a gate nobody has told the room keeps to its slots, as before', () => {
    const { ask, state } = makeGate();
    ask('a', 'npm test'); ask('b', 'npm test'); ask('c', 'npm test');
    expect([state('a'), state('b'), state('c')]).toEqual(['running', 'running', 'waiting']);
  });

  it('room that can no longer be read is room nobody has told it', () => {
    const { gate, ask, state } = makeGate();
    gate.setRoom(100);
    gate.setRoom(null);
    ask('a', 'npm test'); ask('b', 'npm test');
    expect([state('a'), state('b')]).toEqual(['running', 'running']);
  });
});

describe('without room for it', () => {
  it('the second test run waits though a slot is free, and starts when the first ends', () => {
    // The measured case: 291 MB of room is not room for a second run.
    const { gate, ask, state } = makeGate();
    gate.setRoom(1_000);
    ask('a', 'npm test'); ask('b', 'npm test');
    expect([state('a'), state('b')]).toEqual(['running', 'waiting']);
    gate.finish('a');
    expect(state('b')).toBe('running');
  });

  it('one that does not fit still starts when nothing else is running: one at a time', () => {
    const { gate, ask, state } = makeGate();
    gate.setRoom(291);
    ask('a', 'npm test'); ask('b', 'node build.mjs');
    expect([state('a'), state('b')]).toEqual(['running', 'waiting']);
    gate.finish('a');
    expect(state('b')).toBe('running');
  });

  it('a light command never waits for room', () => {
    const { gate, ask, state } = makeGate();
    gate.setRoom(-2_000);
    ask('a', 'git status'); ask('b', 'rg needle src');
    expect([state('a'), state('b')]).toEqual(['running', 'running']);
  });

  it('nor does a thread marked urgent', () => {
    const { gate, ask, state } = makeGate();
    gate.setRoom(-2_000);
    ask('a', 'npm test', { urgent: true });
    expect(state('a')).toBe('running');
  });

  it('what a running command may still take is counted before it has taken it', () => {
    const { gate, ask, state, advance } = makeGate();
    // The room was read before the run began, so none of the run is in it.
    gate.setRoom(1_500);
    advance(5_000);
    ask('a', 'npm test');
    gate.observe('a', 100);
    ask('b', 'npm test');
    expect(state('b')).toBe('waiting');
    // A fresh reading has the run in it at 100 MB: 800 more are still expected.
    advance(60_000);
    gate.setRoom(1_600);
    expect(state('b')).toBe('waiting');
    // Once it has reached its size nothing more is held back for it.
    gate.observe('a', 900);
    advance(60_000);
    gate.setRoom(900);
    expect(state('b')).toBe('running');
  });

  it('a command that grew past what it took before is counted at what it took', () => {
    const { gate, ask, state, advance } = makeGate();
    gate.setRoom(3_000);
    advance(1_000);
    ask('a', 'npm test');
    gate.observe('a', 2_400);
    ask('b', 'npm test');
    expect(state('b')).toBe('waiting');
  });

  it('a smaller command does not slip past a bigger one waiting for room', () => {
    const { gate, ask, state } = makeGate();
    gate.setRoom(1_300);
    ask('a', 'npm test');
    // 400 MB are left: no room for the next test run, room enough for the script behind it.
    ask('b', 'npm test', { score: 7 });
    ask('c', 'node build.mjs', { score: 5 });
    expect([state('a'), state('b'), state('c')]).toEqual(['running', 'waiting', 'waiting']);
    gate.finish('a');
    expect([state('b'), state('c')]).toEqual(['running', 'running']);
  });
});

describe('with no room at all', () => {
  it('what is known to be big waits, even with nothing running', () => {
    const { gate, ask, state } = makeGate();
    gate.setRoom(0);
    ask('a', 'npm test'); ask('b', 'node build.mjs');
    expect([state('a'), state('b')]).toEqual(['waiting', 'waiting']);
    gate.setRoom(1);
    expect([state('a'), state('b')]).toEqual(['running', 'waiting']);
  });

  it('a command nothing has measured is tried, one at a time', () => {
    // The Python line that waited 20 minutes to read one file.
    const { gate, ask, state, advance } = makeGate();
    gate.setRoom(-800);
    ask('a', 'python3 -I -c "print(1)"'); ask('b', 'jq . counts.json');
    expect([state('a'), state('b')]).toEqual(['running', 'waiting']);
    // Measured small and past its first seconds, it is no longer what the next one waits behind.
    gate.observe('a', 12);
    advance(10_000);
    expect(state('b')).toBe('running');
  });

  it('and is not tried while something measured big is still running', () => {
    const { gate, ask, state, advance } = makeGate();
    gate.setRoom(-800);
    ask('a', 'python3 train.py');
    gate.observe('a', 2_000);
    advance(60_000);
    ask('b', 'jq . counts.json');
    expect(state('b')).toBe('waiting');
    gate.finish('a');
    expect(state('b')).toBe('running');
  });

  it('gets past a big command that is waiting for room, which a known one does not', () => {
    const { gate, ask, state } = makeGate();
    gate.setRoom(-800);
    ask('a', 'npm test', { score: 9 });
    ask('b', 'node build.mjs', { score: 7 });
    ask('c', 'jq . counts.json', { score: 2 });
    expect([state('a'), state('b'), state('c')]).toEqual(['waiting', 'waiting', 'running']);
  });

  it('a command marked heavy by the chains it was in is not one nothing has measured', () => {
    const { gate, ask, state } = makeGate();
    for (let i = 0; i < 4; i++) gate.history.record('npx vitest run | wc -l', { peakMb: 1_300, durationMs: 60_000 });
    gate.setRoom(-800);
    ask('a', 'npx vitest run | sort');
    expect(state('a')).toBe('waiting');
  });
});

describe('the computer\'s own word still comes first', () => {
  it('short of memory, nothing that is not light starts, whatever the room', () => {
    const { gate, ask, state } = makeGate();
    gate.setRoom(8_000);
    gate.setPressure('tight');
    ask('a', 'npm test'); ask('b', 'jq . counts.json'); ask('c', 'git status');
    expect([state('a'), state('b'), state('c')]).toEqual(['waiting', 'waiting', 'running']);
    gate.setPressure('normal');
    expect([state('a'), state('b')]).toEqual(['running', 'running']);
  });

  it('the slots are still the most that run at once, however much room there is', () => {
    const { gate, ask, state } = makeGate();
    gate.setRoom(64_000);
    ask('a', 'npm test'); ask('b', 'npm test'); ask('c', 'npm test');
    expect([state('a'), state('b'), state('c')]).toEqual(['running', 'running', 'waiting']);
  });
});

describe('what it says and writes down', () => {
  it('a command refused for want of room is told that, not that the computer is short', () => {
    const { gate, ask, state, replies, advance } = makeGate();
    gate.setRoom(0);
    ask('a', 'npm test');
    advance(20 * 60_000);
    expect(state('a')).toBe('refused');
    const said = replies.get('a')![0];
    expect(said.allow === false && said.reason).toBe(refusal(20 * 60_000, 'normal', true));
    expect(refusal(20 * 60_000, 'normal', true)).toMatch(/is using all the memory it may on this computer/);
    expect(refusal(20 * 60_000, 'normal', true)).not.toMatch(/short of memory|heavier work/);
    // The two it said before are as they were.
    expect(refusal(60_000, 'normal')).toMatch(/behind heavier work that has not finished/);
    expect(refusal(60_000, 'tight')).toMatch(/This computer is short of memory/);
    expect(refusal(60_000, 'tight', true)).toMatch(/This computer is short of memory/);
  });

  it('a running command carries what it was expected to take and the room it started in', () => {
    const { gate, ask } = makeGate();
    gate.setRoom(1_000);
    ask('a', 'npm test'); ask('b', 'git status'); ask('c', 'jq . counts.json');
    expect(gate.running.get('a')).toMatchObject({ needMb: 900, roomMb: 1_000 });
    // The room a later one starts in is what the test run has left of it.
    expect(gate.running.get('b')).toMatchObject({ needMb: 0, roomMb: 100 });
    expect(gate.waiting.get('c')).toMatchObject({ needMb: null });
    const unknown = makeGate();
    unknown.ask('a', 'npm test');
    expect(unknown.gate.running.get('a')).toMatchObject({ needMb: 900, roomMb: null });
  });
});
