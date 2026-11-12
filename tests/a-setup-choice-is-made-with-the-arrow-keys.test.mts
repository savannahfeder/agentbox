// A SETUP CHOICE IS MADE WITH THE ARROW KEYS (w-1e52420829, 2026-11-12).
//
// A first-day power user went through the setup by keyboard and logged it as
// broken: "Agent choices are skipped by Tab", and had to click to pick Codex.
// The same was true of the plan and the look: their rows were clickable and
// nothing else, so a keyboard user could not pick Pro at all.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { nextChoice } from '../renderer/src/setup-split.ts';

const split = fs.readFileSync(new URL('../renderer/src/components/SetupSplit.tsx', import.meta.url), 'utf8');

describe('the choice one along', () => {
  const agents = ['claude', 'codex'] as const;
  it('moves down and up the list', () => {
    expect(nextChoice(agents, 'claude', 1)).toBe('codex');
    expect(nextChoice(agents, 'codex', -1)).toBe('claude');
    expect(nextChoice(['a', 'b', 'c'], 'b', 1)).toBe('c');
  });
  it('stops at either end rather than wrapping', () => {
    expect(nextChoice(agents, 'codex', 1)).toBe('codex');
    expect(nextChoice(agents, 'claude', -1)).toBe('claude');
  });
  it('starts from the top when what is ticked is not in the list', () => {
    expect(nextChoice(['a', 'b'], 'z', 1)).toBe('b');
    expect(nextChoice(['a', 'b'], 'z', -1)).toBe('a');
  });
  it('has nothing to move to in an empty list', () => {
    expect(nextChoice([] as string[], 'a', 1)).toBe('a');
  });
});

describe('the setup', () => {
  it('moves the agent, the plan and the look with ↑ and ↓', () => {
    expect(split).toMatch(/choose\.current = \(by\) => setEngine\(nextChoice\(/);
    expect(split).toMatch(/choose\.current = \(by\) => setPlan\(nextChoice\(/);
    expect(split).toMatch(/choose\.current = \(by\) => p\.onLook\(nextChoice\(/);
  });
  it('leaves the arrows alone while a box is being typed in, and on a step with no choice', () => {
    expect(split).toMatch(/if \(\(e\.key === 'ArrowDown' \|\| e\.key === 'ArrowUp'\) && !typing && choose\.current\)/);
    expect(split).toMatch(/choose\.current = null;\n  let head/);
  });
});
