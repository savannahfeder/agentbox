// TERMINALS GIVE WAY WHEN MEMORY RUNS OUT, THE LEAST WATCHED FIRST (w-7b5b89d886).
//
// What was asked: "If we have a certain number of terminals open and it becomes
// too much for the Mac, then we should really close them." Before this, the
// only limit was a count (twenty); a terminal running something was never
// ended for memory, however short the Mac was.
//
// The rule, measured with an injected clock and pressure reading: only while
// memory is critical, once a look; every shell at its prompt nobody looked at
// for ten minutes, plus the one running something that was looked at least
// recently. Never one looked at inside those ten minutes.
import { describe, it, expect, vi } from 'vitest';
import { TaskTerminals, ENDED } from '../main/task-terminals.mjs';

const MIN = 60_000;

function fixture(pressure = 'critical') {
  const clock = { t: 0 };
  const level = { now: pressure };
  const made = [];
  const spawn = vi.fn(() => {
    let onData = () => {};
    const child = { pid: 3000 + made.length, process: 'zsh', write: vi.fn(), resize: vi.fn(), kill: vi.fn(), onData: (f) => { onData = f; }, onExit: () => {}, say: (s) => onData(s) };
    made.push(child);
    return child;
  });
  const manager = new TaskTerminals({ spawn, resolve: () => '/tmp', disposeProcess: (p) => p.kill(), sweepMs: 0, now: () => clock.t, readPressure: async () => level.now });
  return { manager, made, clock, level, tick: (ms) => { clock.t += ms; } };
}

// Three terminals running servers, opened then left at 0, 5 and 10 minutes.
function threeServers(f) {
  for (const k of ['a', 'b', 'c']) {
    f.manager.open(k);
    f.made.at(-1).process = 'node';
    f.tick(5 * MIN);
  }
}

describe('while memory is critical', () => {
  it('ends the server looked at least recently, one a look, oldest first', async () => {
    const f = fixture();
    threeServers(f);
    f.tick(20 * MIN);
    expect(await f.manager.relieveMemory()).toEqual(['a']);
    expect(await f.manager.relieveMemory()).toEqual(['b']);
    expect([...f.manager.sessions.keys()]).toEqual(['c']);
  });

  it('never one looked at in the last ten minutes', async () => {
    const f = fixture();
    threeServers(f);
    f.manager.read('a', 0);
    f.tick(10 * MIN - 1);
    expect(await f.manager.relieveMemory()).toEqual(['b']);
    expect(await f.manager.relieveMemory()).toEqual(['c']);
    expect(await f.manager.relieveMemory()).toEqual([]);
    expect(f.manager.sessions.has('a')).toBe(true);
  });

  it('takes every unwatched shell at its prompt along with the one server', async () => {
    const f = fixture();
    f.manager.open('idle-1');
    f.manager.open('idle-2');
    threeServers(f);
    f.tick(20 * MIN);
    expect((await f.manager.relieveMemory()).sort()).toEqual(['a', 'idle-1', 'idle-2']);
  });

  it('a terminal it ended says so when it is opened again, under what it last showed', async () => {
    const f = fixture();
    f.manager.open('a');
    f.made[0].process = 'node';
    f.made[0].say('Compiled successfully\r\n');
    f.manager.read('a', 0);
    f.tick(11 * MIN);
    await f.manager.relieveMemory();
    const again = f.manager.open('a');
    expect(again.data).toContain('Compiled successfully');
    expect(again.data).toContain(ENDED.memory);
  });
});

describe('otherwise nothing is ended for memory', () => {
  it('not while memory is only tight', async () => {
    const f = fixture('tight');
    threeServers(f);
    f.tick(3 * 60 * MIN);
    expect(await f.manager.relieveMemory()).toEqual([]);
    expect(f.manager.sessions.size).toBe(3);
  });

  it('not when the reading fails', async () => {
    const f = fixture();
    f.manager.readPressure = async () => { throw new Error('sysctl'); };
    threeServers(f);
    f.tick(3 * 60 * MIN);
    expect(await f.manager.relieveMemory()).toEqual([]);
  });

  it('not on a computer it cannot read memory on at all', async () => {
    const f = fixture();
    f.manager.readPressure = null;
    threeServers(f);
    f.tick(3 * 60 * MIN);
    expect(await f.manager.relieveMemory()).toEqual([]);
  });
});
