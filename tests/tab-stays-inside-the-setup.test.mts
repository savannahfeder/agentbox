// TAB STAYS INSIDE THE SETUP (w-fbe5e95dea, 2026-11-10).
//
// A round-six tester on "Add AI teammates" pressed Tab twice and then Enter,
// and the model menu of the app drawn behind the setup opened. Tab walked focus
// out of the setup panel into the live app beside it. Tab and Shift-Tab now go
// round the setup's own controls.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { tabStop } from '../renderer/src/setup-split.ts';

describe('tabStop', () => {
  it('moves to the next control and wraps at the end', () => {
    expect(tabStop(3, 0, false)).toBe(1);
    expect(tabStop(3, 2, false)).toBe(0);
  });
  it('moves back with Shift and wraps at the start', () => {
    expect(tabStop(3, 1, true)).toBe(0);
    expect(tabStop(3, 0, true)).toBe(2);
  });
  it('starts at the first, or the last going back, from outside the setup', () => {
    expect(tabStop(3, -1, false)).toBe(0);
    expect(tabStop(3, -1, true)).toBe(2);
  });
  it('has nowhere to go with no controls', () => {
    expect(tabStop(0, -1, false)).toBe(-1);
  });
});

describe('the setup', () => {
  const src = fs.readFileSync(new URL('../renderer/src/components/SetupSplit.tsx', import.meta.url), 'utf8');
  it('takes Tab itself', () => {
    expect(src).toMatch(/if \(e\.key === 'Tab'\) \{/);
    expect(src).toMatch(/tabStop\(/);
  });
  it('lets no Enter on a control behind it through', () => {
    expect(src).toMatch(/where !== 'behind' && inSetup && enterIsTheButtons\(e\)/);
  });
});
