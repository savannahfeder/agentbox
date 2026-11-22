// A thread started from a review ask opens "Priya Shah asked:" over her words, and the line under its title took
// that lead-in as the ask: "You asked: Priya Shah asked:." Measured through workingContext on the body the hand-off writes.
import { describe, it, expect } from 'vitest';
import { askLine } from '../renderer/src/one-thing-at-a-time';

const LINK = 'https://app.agentbox.ac/t/priya/w-0123456789';

describe('the line under a working thread\'s title', () => {
  it('passes over a lead-in that ends in a colon', () => {
    expect(askLine('Priya Shah asked:\n\nCan a declined card leave a hold?\n\nSay whether it looks good.', 'Friendlier copy')).toBe('You asked: Can a declined card leave a hold?');
  });
  it('reads a link as its words, and says nothing when they are the title', () => {
    expect(askLine(`Priya Shah asked:\n\n[Friendlier payment failed copy](${LINK})\n\nPriya: is it friendly enough?`, 'Friendlier payment failed copy')).toBeNull();
    expect(askLine(`Priya Shah asked:\n\n[Friendlier payment failed copy](${LINK})`, 'Payment copy')).toBe('You asked: Friendlier payment failed copy.');
  });
  it('keeps a first paragraph that only has a colon inside it', () => {
    expect(askLine('Fix this: the totals are off', 'Totals')).toBe('You asked: Fix this: the totals are off.');
  });
  it('keeps an ask that is all lead-in as it was', () => {
    expect(askLine('Three fixes:', 'Fixes')).toBe('You asked: Three fixes:.');
  });
  it('still says nothing when the ask is the title', () => {
    expect(askLine('Fix the login bug', 'Fix the login bug')).toBeNull();
  });
});
