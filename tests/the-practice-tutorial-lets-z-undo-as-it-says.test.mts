// THE PRACTICE TUTORIAL LETS Z UNDO, AS IT SAYS (w-fbe5e95dea, 2026-11-10).
//
// Both final-round testers read the practice tutorial's "Z brings back
// anything you mark done", pressed Z, and nothing happened: the walk holds
// every key but the one its card names, and Z was held with the rest. Z
// reaches the app on every beat, as Tab does.
import { describe, it, expect } from 'vitest';
import { swallowPress } from '../renderer/src/onboarding.ts';

describe('the practice tutorial and Z', () => {
  it('lets Z through whatever key the card names', () => {
    expect(swallowPress('E', { key: 'z' }, null)).toBe(false);
    expect(swallowPress('↵', { key: 'Z', shiftKey: true }, null)).toBe(false);
  });
  it('still holds a key the card did not name', () => {
    expect(swallowPress('E', { key: 'c' }, null)).toBe(true);
  });
});
