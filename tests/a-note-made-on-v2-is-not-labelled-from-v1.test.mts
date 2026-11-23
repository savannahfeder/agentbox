// A whole-file note typed on index.html "v2 of 2" showed "From v1, still open"
// beside it (two overnight testers, 2026-11-16, three files). A file edited in
// place keeps one id across its versions, so the note's id matched v1 and it
// was drawn as carried over from v1. A note stores the version it was made on
// (`v`), and that number now decides.
import { describe, it, expect } from 'vitest';
import { carriedNotes } from '../shared/artifact-marks.mts';

const family = { versions: [{ id: 'index.html', n: 1 }, { id: 'index.html', n: 2 }, { id: 'index.html', n: 3 }] } as never;
const note = (id: string, v?: number) => ({ id, file: 'index.html', resolved: false, ...(v ? { v } : {}) });

describe('notes on a file edited in place', () => {
  it('a note made on v2 is not carried into v2 from v1', () => {
    expect(carriedNotes(family, 1, [note('a', 2)])).toEqual([]);
  });

  it('a note made on v2 is carried into v3 and says it came from v2', () => {
    expect(carriedNotes(family, 2, [note('a', 2)]).map((n) => n.from)).toEqual(['v2']);
  });

  it('a note made on v1 is still carried into v2 from v1', () => {
    expect(carriedNotes(family, 1, [note('a', 1)]).map((n) => n.from)).toEqual(['v1']);
  });

  it('an older note with no version number reads as before', () => {
    expect(carriedNotes(family, 1, [note('a')]).map((n) => n.from)).toEqual(['v1']);
  });

  it('a later version\'s note never shows on an earlier one', () => {
    expect(carriedNotes(family, 1, [note('a', 3)])).toEqual([]);
  });
});
