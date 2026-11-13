// THE FIRST-RUN WALK PICTURES EVERY SETUP STEP AND EVERY TIP (w-1e52420829, 2026-11-12).
//
// Seven rounds of testers had passed the first run when the founder walked it
// and called it "98% nonfunctional". Walking it by keyboard on a throwaway copy
// then found a held Enter that ran the whole setup, a walkthrough that went
// from 1 of 5 to 3 of 5, an email field that kept the caret, and a last step
// with no tip. `walk-first-run.mjs` is that walk kept: a setup step or a tip
// added later has to be on it, or be named here with why it cannot be.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { LESSONS } from '../renderer/src/tour.ts';

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const walk = read('.claude/skills/verify-agentbox/scripts/walk-first-run.mjs');
const steps = [.../export type SetupStep = ([^;]+);/.exec(read('renderer/src/setup-split.ts'))![1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]);

const STEPS_NOT_WALKED: Record<string, string> = {
  folder: 'the copy has chats, and the chats step takes its place',
  teammates: 'AI teammates are off in the copy',
};
const TIPS_NOT_WALKED: Record<string, string> = {
  start: 'the walkthrough opens on the New thread box, so nothing asks for N',
  choose: 'the practice answer offers no options',
};

describe('the first-run walk', () => {
  it('reads the setup steps the app has', () => {
    expect(steps).toContain('account');
    // Eight since the purchase page became the plan step (2026-11-12).
    expect(steps.length).toBeGreaterThanOrEqual(8);
  });
  it('pictures every setup step', () => {
    const missing = steps.filter((s) => !STEPS_NOT_WALKED[s] && !walk.includes(`see('${s}'`));
    expect(missing).toEqual([]);
  });
  it('pictures every walkthrough tip', () => {
    const missing = LESSONS.filter((l) => !TIPS_NOT_WALKED[l] && !walk.includes(`see('walkthrough-${l}'`));
    expect(missing).toEqual([]);
  });
  it('leaves out only steps and tips that still exist', () => {
    expect(Object.keys(STEPS_NOT_WALKED).filter((s) => !steps.includes(s))).toEqual([]);
    expect(Object.keys(TIPS_NOT_WALKED).filter((l) => !(LESSONS as string[]).includes(l))).toEqual([]);
  });
  it('holds Enter down, checks the caret moved to the password, and fails on a page error', () => {
    expect(walk).toMatch(/autoRepeat: true/);
    expect(walk).toMatch(/document\.activeElement\?\.type === 'password'/);
    expect(walk).toMatch(/page\.errors\.length/);
  });
  it('is what the power-test skill says to run before any tester', () => {
    expect(read('.claude/skills/power-test/SKILL.md')).toMatch(/walk-first-run\.mjs <out dir> \[dark\|light\]/);
  });
});
