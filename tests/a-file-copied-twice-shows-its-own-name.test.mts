// A FILE COPIED TWICE SHOWS ITS OWN NAME (w-f702d60afe, 2026-11-20).
//
// A thread's file reached a teammate as "a1b2c3d4e5f6-retry-plan.md" in the
// file row on their copy of the thread. A file sent to a thread is kept under a
// 12-hex prefix, and the teammate's copy of it adds a second; the name rule
// took off one. Measured with shownName on the copy's path.
import { describe, it, expect } from 'vitest';
import { shownName } from '../shared/artifact-marks.mts';

describe("a copied file's shown name", () => {
  it('takes off every copy prefix in front of the name', () => {
    expect(shownName('attachments/0123456789ab-a1b2c3d4e5f6-retry-plan.md')).toBe('retry-plan.md');
    expect(shownName('.team/x/0123456789ab-a1b2c3d4e5f6-retry-plan.md')).toBe('retry-plan.md');
  });
  it('still takes off one, and leaves a name with no prefix alone', () => {
    expect(shownName('attachments/a1b2c3d4e5f6-retry-plan.md')).toBe('retry-plan.md');
    expect(shownName('docs/retry-plan.md')).toBe('retry-plan.md');
  });
  it('keeps a name that only looks like a prefix after the first', () => {
    expect(shownName('attachments/a1b2c3d4e5f6-deadbeef0000.md')).toBe('deadbeef0000.md');
  });
});
