// A ONE-WORD TAG BEFORE A COLON IS NOT THE WHOLE TITLE.
//
// In phone session m19 (2026-11-15) a pasted list opening "M19-B1: ..." was
// listed as "M19-B1" until the namer renamed it: shortTitle ends a name at the
// first colon, and one word before it is a tag, not a name. Measured by
// reading shortTitle on the tester's first line. Two words or more before the
// colon still name the thread, as the M16 tests pinned.
import { describe, it, expect } from 'vitest';
import { shortTitle } from '../shared/thread-title.mts';

describe('a tag before a colon', () => {
  it('keeps the words after a one-word tag', () => {
    expect(shortTitle('M19-B1: add a line to the README saying hello from the phone')).toBe('M19-B1: Add a line');
    expect(shortTitle('Bug: the reply box covers the last message on small phones')).toBe('Bug: The reply box covers the last message');
  });
  it('still ends at the colon when two words or more come before it', () => {
    expect(shortTitle('M16 single: add a README line saying hello')).toBe('M16 single');
  });
  it('leaves a short line, a time and a link as they were', () => {
    expect(shortTitle('M19-B1: fix login')).toBe('M19-B1: fix login');
    expect(shortTitle('M16 list:')).toBe('M16 list');
    expect(shortTitle('Two patients at the Riverside clinic both got a confirmation for the 9:30 slot on Friday.')).toBe('Two patients at the Riverside clinic');
    expect(shortTitle('https://example.com/a/very/long/path is broken for everyone who opens it today')).not.toMatch(/^https:$/);
  });
  it('a tag with nothing much after it is the title', () => {
    expect(shortTitle('Later: ok')).toBe('Later: ok');
  });
});
