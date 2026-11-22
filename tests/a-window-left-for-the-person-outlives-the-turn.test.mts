// A WINDOW LEFT FOR THE PERSON OUTLIVES THE TURN (w-543aa8a608).
//
// What broke: an agent opened a browser window (a Playwright server in /tmp)
// for the person to sign in to App Store Connect, and three times it was gone
// by their next turn. The brief promised what an agent leaves running lasts
// while the task is open "or sooner if this computer runs short of memory",
// and the leftover sweep read "short" as merely tight (macOS warning, or under
// 12% free), which a busy 16 GB Mac is most of the day: ten minutes after the
// turn ended, the window was stopped. Measured here with injected listings,
// clocks and pressure: tight now keeps an open task's programs, critical still
// stops them, and the next agent is told to tell the person.
import { describe, it, expect } from 'vitest';
import { LeftoverCleaner } from '../main/leftovers.mts';

const MIN = 60_000;
const HOUR = 60 * MIN;
const T0 = 1_791_200_000_000;
const NODE = '/Users/x/.nvm/versions/node/v22/bin/node';
const sec = (ms: number) => Math.floor(ms / 1000);
const browser = (pid: number, item: string) => ({ pid, ppid: 1, mb: 600, start: sec(T0 - HOUR), exe: NODE, item, product: 'demo', keep: false, cmd: 'node server.js' });

function harness(pressure: 'normal' | 'tight' | 'critical', closed: Record<string, number> = {}) {
  let now = T0;
  const signals: [number, string][] = [];
  const level = { now: pressure };
  const c = new LeftoverCleaner({
    list: async () => [browser(10, 'w-signin')], kill: (pid, sig) => { signals.push([pid, sig]); }, clock: () => now,
    readPressure: async () => level.now, enabledSince: 0, owns: () => true,
    closedAt: (item) => closed[item] ?? null,
  });
  return { c, signals, level, closed, advance: (ms: number) => { now += ms; }, now: () => now };
}

async function wait(h: ReturnType<typeof harness>, ms: number) {
  for (let t = 0; t < ms; t += MIN) { h.advance(MIN); await h.c.tick(); }
}

describe('what an agent leaves open for the person', () => {
  it('is still there an hour later while memory is only tight', async () => {
    const h = harness('tight');
    await h.c.tick();
    h.c.ended('w-signin');
    await wait(h, HOUR);
    expect(h.signals).toEqual([]);
  });

  it('is stopped ten minutes after the turn when memory is critical', async () => {
    const h = harness('critical');
    await h.c.tick();
    h.c.ended('w-signin');
    await wait(h, 9 * MIN);
    expect(h.signals).toEqual([]);
    await wait(h, 2 * MIN);
    expect(h.signals).toEqual([[10, 'SIGTERM']]);
  });

  it('still goes two minutes after the task is closed, at any pressure', async () => {
    const h = harness('normal');
    await h.c.tick();
    h.c.ended('w-signin');
    h.advance(HOUR);
    h.closed['w-signin'] = h.now();
    await wait(h, 3 * MIN);
    expect(h.signals).toEqual([[10, 'SIGTERM']]);
  });

  it('when stopped, the next agent is told to tell the person', async () => {
    const h = harness('critical');
    await h.c.tick();
    h.c.ended('w-signin');
    await wait(h, 11 * MIN);
    const note = h.c.starting('w-signin');
    expect(note).toMatch(/node server\.js/);
    expect(note).toMatch(/the person was using .*tell them it was stopped/i);
  });
});
