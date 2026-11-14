// A SHORT TITLE THAT LEADS INTO A LIST ENDS WITHOUT ITS COLON (QA M-52,
// native Android, 2026-11-12).
//
// "M16 list:" then three "- " lines, sent from the phone, became a thread
// titled "M16 list:", while "M16 single: add a README line" was titled
// "M16 single". A first line short enough to keep as typed only lost a closing
// full stop. Measured from the tester's dumps and by reading shortTitle.
import { describe, it, expect } from 'vitest';
import { shortTitle } from '../shared/thread-title.mts';

describe('a short first line', () => {
  it('drops the colon that leads into what follows', () => {
    expect(shortTitle('M16 list:')).toBe('M16 list');
    expect(shortTitle('Three fixes :')).toBe('Three fixes');
  });

  it('drops a trailing semicolon or comma the same way', () => {
    expect(shortTitle('Fix the header;')).toBe('Fix the header');
    expect(shortTitle('Fix the header,')).toBe('Fix the header');
  });

  it('keeps a colon inside the words, and the ending of a question', () => {
    expect(shortTitle('Ratio 3:2 images')).toBe('Ratio 3:2 images');
    expect(shortTitle('Why is it slow?')).toBe('Why is it slow?');
  });

  it('matches what a first line with words after its colon was already given', () => {
    expect(shortTitle('M16 single: add a README line saying hello')).toBe('M16 single');
  });
});
