// A ONE-LINE OPENING SHOWS NO QUOTE MARK (2026-10-30).
//
// Seen on two copies at 1440x900: a thread opened with "> Patients in Austin
// say they got reminders at 3am" drew the "> " at the start of its first
// message, because your own words are drawn as typed. The title already drops it.
import { describe, it, expect } from 'vitest';
import { withoutLoneQuoteMark } from '../renderer/src/typed-message.ts';

describe('the opening message', () => {
  it('loses the mark on one line', () => {
    expect(withoutLoneQuoteMark('> Patients in Austin say so')).toBe('Patients in Austin say so');
    expect(withoutLoneQuoteMark('>No space')).toBe('No space');
    expect(withoutLoneQuoteMark('  >  Spaces first')).toBe('Spaces first');
    expect(withoutLoneQuoteMark('>> Twice')).toBe('Twice');
  });

  it('keeps a real quotation with a reply under it', () => {
    const text = '> What she said\n\nI disagree';
    expect(withoutLoneQuoteMark(text)).toBe(text);
  });

  it('keeps a > that is not at the start', () => {
    expect(withoutLoneQuoteMark('run ls > out.txt')).toBe('run ls > out.txt');
  });

  it('keeps a mark with nothing after it', () => {
    expect(withoutLoneQuoteMark('>')).toBe('>');
    expect(withoutLoneQuoteMark('')).toBe('');
  });
});
