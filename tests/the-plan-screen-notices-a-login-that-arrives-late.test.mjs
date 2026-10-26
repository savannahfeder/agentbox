// A PLAN SIGNED IN WHILE THE SCREEN IS UP IS A PLAN THE SCREEN FINDS.
//
// QA ran the browser version's first run in a home with no Codex login on
// 2026-10-25 (F-71). The screen said "No plan is signed in yet." Then a Codex
// login appeared on the computer, which is what signing in to Codex in a
// terminal leaves behind. The screen never moved. A reload found it at once:
// "Found on this computer. Your agents will run on your own ChatGPT plan."
//
// The screen looked once, on arrival, and never again, so somebody who signs
// in next door is told they have no plan and pushed into a second sign-in they
// do not need.
//
// THE LOOK IS BOUNDED, because nothing in this app retries for ever
// (CLAUDE.md). The clock stops after LOOK_AGAIN_FOR_MS; coming back to the
// window looks again whatever the clock has done, which is the move somebody
// signing in elsewhere actually makes.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOOK_AGAIN_FOR_MS, LOOK_AGAIN_MS, worthLookingAgain } from '../renderer/src/plan-setup.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const screen = read('renderer/src/components/PlanSetup.tsx');

const claude = (p) => ({ engine: 'claude', found: false, signedIn: false, ...p });
const codex = (p) => ({ engine: 'codex', found: false, signedIn: false, ...p });

describe('1. when another look could still change the screen', () => {
  it('an empty computer is still worth looking at', () => {
    expect(worthLookingAgain([claude(), codex()])).toBe(true);
    expect(worthLookingAgain([])).toBe(true);
    expect(worthLookingAgain(null)).toBe(true);
  });

  it('and so is the screen QA was left on: on the disk, signed out', () => {
    expect(worthLookingAgain([claude(), codex({ found: true })])).toBe(true);
  });

  it('and a plan that is signed in is the end of it', () => {
    expect(worthLookingAgain([claude(), codex({ found: true, signedIn: true })])).toBe(false);
    expect(worthLookingAgain([claude({ found: true, signedIn: true }), codex()])).toBe(false);
  });
});

describe('2. and the screen takes that look', () => {
  it('on a clock while it is up, and on coming back to the window', () => {
    const at = screen.indexOf('const readingsNow = ');
    expect(at, 'the plan question never looks again').toBeGreaterThan(-1);
    const body = screen.slice(at, at + 1600);
    expect(body).toMatch(/worthLookingAgain/);
    expect(body).toMatch(/setInterval\(/);
    expect(body).toMatch(/addEventListener\('focus'/);
    expect(body).toMatch(/addEventListener\('visibilitychange'/);
  });

  it('with the cache thrown away, or it would read the computer as it was', () => {
    const body = screen.slice(screen.indexOf('const again = '), screen.indexOf('const again = ') + 1200);
    expect(body).toMatch(/readingsNow\.current\(true\)/);
  });

  it('and never twice at once, since each look spawns the tool', () => {
    const body = screen.slice(screen.indexOf('const again = '), screen.indexOf('const again = ') + 1200);
    expect(body).toMatch(/busyLooking/);
  });

  it('and the clock stops, because nothing here retries for ever', () => {
    expect(LOOK_AGAIN_MS).toBeGreaterThanOrEqual(3_000);
    expect(LOOK_AGAIN_FOR_MS).toBeGreaterThan(LOOK_AGAIN_MS);
    expect(LOOK_AGAIN_FOR_MS).toBeLessThanOrEqual(10 * 60_000);
    const body = screen.slice(screen.indexOf('const again = '), screen.indexOf('const again = ') + 1600);
    expect(body).toMatch(/LOOK_AGAIN_FOR_MS/);
  });

  it('and it is not the quiet probe that paints "Checking this computer…"', () => {
    // `check` is the arrival look and owns the note under the question; this
    // one only replaces the reading, so nothing flickers every few seconds.
    const body = screen.slice(screen.indexOf('const again = '), screen.indexOf('const again = ') + 1200);
    expect(body).not.toMatch(/setLooking\(/);
  });
});
