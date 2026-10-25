// THE THREADS PAGE DOES NOT RENDER ITSELF FOREVER (w-3d0fa23ffb, 2026-10-21).
//
// The founder's Agentbox used 12 min 46 s of CPU in its first 11.5 minutes
// after a restart, over a full core, doing nothing. A copy seeded with 3,000
// threads did the same: 216 React commits a second while idle on the threads
// page, every one of them App's `needsLookedAt` changing. The effect that
// remembers when you last had Needs You open stamped Date.now() whenever
// `inbox` changed, and `inbox` is rebuilt on every render, so each stamp
// rendered again. A small store hid it: a render under a millisecond stamps the
// same number and React stops. The stamp now moves only when something in
// Needs You arrived after it, so a render with nothing new changes nothing.
import { it, expect } from 'vitest';
import fs from 'node:fs';
import { lookedAtNow, needsYouLit } from '../renderer/src/needs-you.ts';

const answered = (id, ts) => ({ id, createdAt: 1, wrote: { result: { ts, source: 'agent' } } });

it('with nothing new in Needs You, the stamp stays exactly as it was', () => {
  const inbox = [answered('a', 500), answered('b', 900)];
  expect(lookedAtNow(inbox, 1_000, 5_000)).toBe(1_000);
  expect(lookedAtNow([], 1_000, 5_000)).toBe(1_000);
});

it('a thread that landed after the stamp moves it to now, and then nothing is lit', () => {
  const inbox = [answered('a', 500), answered('b', 2_000)];
  const at = lookedAtNow(inbox, 1_000, 5_000);
  expect(at).toBe(5_000);
  expect(needsYouLit(inbox, at)).toBe(false);
  expect(lookedAtNow(inbox, at, 6_000)).toBe(at);
});

it('a thread stamped ahead of this clock moves the stamp to it, so the next look is still quiet', () => {
  const inbox = [answered('a', 9_000)];
  const at = lookedAtNow(inbox, 1_000, 5_000);
  expect(at).toBe(9_000);
  expect(lookedAtNow(inbox, at, 5_001)).toBe(at);
});

it('a thread landing after you looked still lights the tab', () => {
  const at = lookedAtNow([answered('a', 500)], 1_000, 5_000);
  expect(needsYouLit([answered('a', 500), answered('b', 7_000)], at)).toBe(true);
});

it('App stamps through it, never with a bare Date.now()', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  expect(app).toMatch(/setNeedsLookedAt\(\(at\) => lookedAtNow\(inbox, at, Date\.now\(\)\)\)/);
  expect(app).not.toMatch(/setNeedsLookedAt\(Date\.now\(\)\)/);
});
