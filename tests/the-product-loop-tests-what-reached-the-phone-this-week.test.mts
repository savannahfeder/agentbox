// THE PRODUCT LOOP TESTS WHAT REACHED THE PHONE THIS WEEK.
//
// The daily phone testers were told only what a person passed as --focus, so a
// desktop feature newly built for the phone was tested only if someone
// remembered to say so. scripts/phone-parity.mjs now reads mobile/parity.mjs
// against its copy from a week ago, and the workday tells its testers to lean
// on whatever became wholly the phone's in between.
import { describe, it, expect } from 'vitest';
import { reachedThePhone } from '../scripts/phone-parity.mjs';
import { focusFor } from '../.claude/skills/product-loop/scripts/workday.mjs';

const has = { phone: 'a.tsx', find: 'x' };

describe('what reached the phone', () => {
  it('is a feature missing or partial before and wholly there now', () => {
    const before = { 'thread:rename': { missing: 'a setting' }, 'palette:filter': { ...has, still: 'no agent filter' } };
    const after = { 'thread:rename': has, 'palette:filter': has };
    expect(reachedThePhone(before, after)).toEqual(['thread:rename', 'palette:filter']);
  });

  it('counts a feature the ledger did not name before', () => {
    expect(reachedThePhone({}, { 'thread:new': has })).toEqual(['thread:new']);
  });

  it('is not a feature already there, still partial, or desktop only', () => {
    const before = { 'thread:pin': has, 'palette:usage': { missing: 'meters' }, 'palette:shortcuts': { desktopOnly: 'keys only' } };
    const after = { 'thread:pin': has, 'palette:usage': { ...has, still: 'no meters' }, 'palette:shortcuts': { desktopOnly: 'keys only' } };
    expect(reachedThePhone(before, after)).toEqual([]);
  });
});

describe('the testers are told', () => {
  it('what reached the phone, after any focus a person gave', () => {
    expect(focusFor('the new filters', ['thread:rename'])).toBe('the new filters. These reached the phone this week, so try each: thread:rename');
    expect(focusFor(null, ['thread:rename', 'palette:pause'])).toBe('These reached the phone this week, so try each: thread:rename, palette:pause');
  });

  it('only the focus a person gave when nothing reached the phone', () => {
    expect(focusFor('the new filters', [])).toBe('the new filters');
    expect(focusFor(null, [])).toBe(null);
  });
});
