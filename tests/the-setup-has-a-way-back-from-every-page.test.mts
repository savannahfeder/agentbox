// THE SETUP HAS A WAY BACK FROM EVERY PAGE (w-1e52420829, 2026-11-14).
//
// Someone reached "You're set up." and wanted to change an earlier answer:
// "I've been trying to click these buttons over here beside 'All Set' to find
// a way to go back, but I'm not able to do so". Two things were in the way.
// The last page drew no Back at all, because Back was switched off once the
// steps ran out. And the row of dashes at the top right, one per step, reads
// as a row of buttons and was only a mark of how far through you are.
//
// Reading the code for it found a third: Back on the page after the account
// went to the account step, which sends anyone already signed in forward
// again, so that Back did nothing.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { dashGoesBack, stepBefore, type SetupStep } from '../renderer/src/setup-split.ts';

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const steps: SetupStep[] = ['chats', 'agent', 'account', 'plan', 'teammates', 'look'];

describe('where Back goes', () => {
  it('is the last step, from the page after the last step', () => {
    expect(stepBefore(steps, steps.length, true)).toBe(5);
  });
  it('is the step before, on any step', () => {
    expect(stepBefore(steps, 5, true)).toBe(4);
    expect(stepBefore(steps, 1, false)).toBe(0);
  });
  it('passes over the account step once the account is made, since that step only sends you on', () => {
    expect(stepBefore(steps, 3, true)).toBe(1);
    expect(stepBefore(steps, 3, false)).toBe(2);
  });
  it('is nowhere in the setup from its first step, or when the account was that first step', () => {
    expect(stepBefore(steps, 0, false)).toBe(null);
    expect(stepBefore(['account', 'plan', 'look'], 1, true)).toBe(null);
  });
});

describe('the dashes at the top', () => {
  it('take you back to a step you have passed', () => {
    expect(dashGoesBack(steps, 0, 6, true)).toBe(true);
    expect(dashGoesBack(steps, 4, 5, true)).toBe(true);
  });
  it('do nothing for the step you are on or one still to come', () => {
    expect(dashGoesBack(steps, 3, 3, true)).toBe(false);
    expect(dashGoesBack(steps, 5, 3, true)).toBe(false);
  });
  it('do nothing for the account step once the account is made', () => {
    expect(dashGoesBack(steps, 2, 6, true)).toBe(false);
    expect(dashGoesBack(steps, 2, 3, false)).toBe(true);
  });
});

describe('the page', () => {
  const split = read('renderer/src/components/SetupSplit.tsx');
  const css = read('renderer/src/components/setup-split.css');
  it('draws Back on the last page too', () => {
    expect(split).toContain('const backTo = stepBefore(steps, at, signedIn);');
    expect(split).toContain('const back = backTo !== null || p.onBack ? () => { setError(null); if (backTo !== null) setAt(backTo); else p.onBack?.(); } : null;');
    expect(split).not.toMatch(/const back = !finished/);
  });
  // Out of the Tab ring: Back is the keyboard's way, and six stops before the first field would be in the way of it.
  it('makes each passed dash a button that goes to its step', () => {
    expect(split).toMatch(/dashGoesBack\(steps, i, at, signedIn\)\s*\? <button type="button" key=\{s\} className="ss-was" tabIndex=\{-1\} disabled=\{busy\} aria-label=\{`Back to step \$\{i \+ 1\}`\} onClick=\{\(\) => \{ setError\(null\); setAt\(i\); \}\} \/>/);
  });
  it('gives a dash room to press and shows it can be', () => {
    expect(css).toMatch(/\.setup-split \.ss-steps button \{[^}]*height: 18px;[^}]*cursor: pointer;/);
    expect(css).toMatch(/\.setup-split \.ss-steps button:hover::before \{ background: var\(--text\); \}/);
  });
});
