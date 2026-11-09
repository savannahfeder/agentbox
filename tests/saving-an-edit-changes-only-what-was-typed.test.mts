// Two edits far apart in one session rewrote everything between them. Measured:
// patchOriginal took one range from the first change to the last, so a line of
// `_emphasis_` and a `|---|` table nobody touched came back as `*emphasis*` and
// `| --- |`. A file whose lines drifted against the editor returned null, and the
// whole file was reformatted. Now each change lands alone, and a change in a
// stretch that drifted rewrites that stretch and nothing else.
import { describe, it, expect } from 'vitest';
import { mdToPmDoc, pmDocToMd } from '../renderer/src/editor/markdown';
import { patchOriginal } from '../renderer/src/editor/patch-md';

const roundTrip = (md) => pmDocToMd(mdToPmDoc(md));
const FILE = [
  '# Plan',
  '',
  'First line she will change.',
  '',
  'A line with _emphasis_ nobody touches.',
  '',
  '* a starred bullet',
  '* another starred bullet',
  '',
  '| Plan | Price |',
  '|---|---|',
  '| Free | $0 |',
  '',
  'Last line she will change.',
  '',
].join('\n');

describe('what she typed lands, and only that', () => {
  it('two edits far apart leave every line between them as it was', () => {
    const base = roundTrip(FILE);
    expect(base).not.toBe(FILE);
    const next = base.replace('First line she will change.', 'First line changed.').replace('Last line she will change.', 'Last line changed.');
    expect(patchOriginal(FILE, base, next)).toBe(FILE.replace('First line she will change.', 'First line changed.').replace('Last line she will change.', 'Last line changed.'));
  });

  it('no edit at all gives the file back byte for byte', () => {
    const base = roundTrip(FILE);
    expect(patchOriginal(FILE, base, base)).toBe(FILE);
  });

  it('an edit in the last line keeps a file with no newline at its end that way', () => {
    const file = 'One _a_ line.\n\nLast.';
    const base = roundTrip(file);
    expect(patchOriginal(file, base, base.replace('Last.', 'Final.'))).toBe('One _a_ line.\n\nFinal.');
  });

  it('a new line added between two others touches neither', () => {
    const base = roundTrip(FILE);
    const next = base.replace('First line she will change.', 'First line she will change.\n\nA new thought.');
    expect(patchOriginal(FILE, base, next)).toBe(FILE.replace('First line she will change.', 'First line she will change.\n\nA new thought.'));
  });

  it('a line deleted goes, and its neighbours stay', () => {
    const base = roundTrip(FILE);
    const next = base.replace('First line she will change.\n\n', '');
    const saved = patchOriginal(FILE, base, next);
    expect(saved).not.toContain('First line she will change.');
    expect(saved).toContain('_emphasis_');
    expect(saved).toContain('|---|---|');
  });

  it('a stretch the editor drew at another length is rewritten alone, never the whole file', () => {
    const file = 'Keep _this_ one.\n\n> quote one\n>\n> quote two\n\nChange this one.\n\nKeep _that_ one.\n';
    const base = roundTrip(file);
    const next = base.replace('quote two', 'quote changed');
    const saved = patchOriginal(file, base, next);
    expect(saved).not.toBeNull();
    expect(saved).toContain('quote changed');
    expect(saved).toContain('Keep _this_ one.');
    expect(saved).toContain('Keep _that_ one.');
  });

  it('does not lose a line the editor could not hold', () => {
    const file = '<!-- kept by the app -->\n\nThe line to change.\n\nAnother _line_.\n';
    const base = roundTrip(file);
    const saved = patchOriginal(file, base, base.replace('The line to change.', 'Changed.'));
    expect(saved).toContain('<!-- kept by the app -->');
    expect(saved).toContain('Changed.');
    expect(saved).toContain('_line_');
  });
});
