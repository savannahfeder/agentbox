// Two overnight testers (2026-11-16) put a thread in Later, pressed 1 on its
// option and read "In Later until tomorrow 8:00am" under "Picked that option".
// The pick is held three seconds for Z before it is written (deferCommit), and
// the Later line read only what was written, so in those seconds it still said
// Later. Tonight's earlier fix covered the thread once the pick was written.
import { describe, it, expect } from 'vitest';
import { showsWhenItComesBack } from '../renderer/src/list-rules.ts';

const now = 1_794_815_495_000;
const tomorrow8 = 1_794_844_800_000;
const later = { status: 'open', snoozedUntil: tomorrow8 };

describe('the Later line on a thread', () => {
  it('goes the moment a pick or reply is on its way to a thread you put in Later', () => {
    expect(showsWhenItComesBack(later, tomorrow8, true, now)).toBe(false);
  });

  it('stays while nothing is on its way', () => {
    expect(showsWhenItComesBack(later, tomorrow8, false, now)).toBe(true);
  });

  it('stays on a thread an agent paused, which a word does not lift', () => {
    expect(showsWhenItComesBack({ status: 'open' }, tomorrow8, true, now)).toBe(true);
  });

  it('never shows on a closed thread or one with no time', () => {
    expect(showsWhenItComesBack({ ...later, status: 'done' }, tomorrow8, false, now)).toBe(false);
    expect(showsWhenItComesBack(later, 0, false, now)).toBe(false);
  });
});
