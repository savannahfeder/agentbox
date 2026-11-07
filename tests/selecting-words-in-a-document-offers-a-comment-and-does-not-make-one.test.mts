// SELECTING WORDS IN A DOCUMENT OFFERS A COMMENT; IT DOES NOT MAKE ONE.
//
// Reported: "I keep highlighting sections and it only highlights a portion of
// them. Oftentimes I'm just highlighting text for fun... I don't like that it
// automatically comments." Measured in the code: letting go of the mouse over
// any selected words in a markdown or code file started a comment at once and
// cleared the selection, and the quote was cut to its first 400 characters, so
// a long section lit up only partly. Measured in a browser on the 18 KB YC
// application draft: each redraw of the file view re-read the whole document,
// a 55 ms stall (165 ms at four times the length), which is the slow scroll.
//
// Now a selection keeps its own highlight and a small bar offers Comment and
// Copy; a comment starts only from the bar. A quote keeps up to 3,000 characters.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { cleanMark } from '../shared/artifact-marks.mjs';
import { barSpot, pickedIn, quoteFrom, quotesKey, MAX_QUOTE_CHARS } from '../renderer/src/selection-bar.ts';

const root = { contains: (n) => n?.inside === true };
const IN = { inside: true };
const OUT = { inside: false };
const sel = (text, anchor = IN, focus = IN) => ({ isCollapsed: !text, rangeCount: text ? 1 : 0, toString: () => text, anchorNode: anchor, focusNode: focus });

describe('which selections offer the bar', () => {
  it('words selected inside the page', () => {
    expect(pickedIn(root, sel('the first task'))).toBe('the first task');
  });
  it('a selection dragged out past the page still counts, from either end', () => {
    expect(pickedIn(root, sel('the first task', IN, OUT))).toBe('the first task');
    expect(pickedIn(root, sel('the first task', OUT, IN))).toBe('the first task');
  });
  it('not a click with nothing selected', () => {
    expect(pickedIn(root, sel(''))).toBeNull();
  });
  it('not spaces alone', () => {
    expect(pickedIn(root, sel('  \n '))).toBeNull();
  });
  it('not words selected somewhere else, such as the comment list', () => {
    expect(pickedIn(root, sel('about n1', OUT, OUT))).toBeNull();
  });
  it('not with no page', () => {
    expect(pickedIn(null, sel('words'))).toBeNull();
  });
});

describe('a long section is quoted whole', () => {
  const section = Array.from({ length: 30 }, (_, i) => `Sentence ${i} of a long section about the company.`).join('\n');
  it('a 1,500 character selection keeps every word', () => {
    expect(section.length).toBeGreaterThan(1400);
    const q = quoteFrom(section);
    expect(q.endsWith('Sentence 29 of a long section about the company.')).toBe(true);
    expect(cleanMark({ do: 'note', id: 'n1', file: 'a.md', place: { kind: 'quote', text: q }, text: 'x', by: 'me', ts: 1 }).place.text).toBe(q);
  });
  it('lines are joined with single spaces', () => {
    expect(quoteFrom('one\n\n  two\tthree ')).toBe('one two three');
  });
  it('past the cap it is cut, on the page and in the store alike', () => {
    const huge = 'word '.repeat(2000);
    expect(quoteFrom(huge).length).toBe(MAX_QUOTE_CHARS);
    expect(cleanMark({ do: 'note', id: 'n1', file: 'a.md', place: { kind: 'quote', text: huge }, text: 'x', by: 'me', ts: 1 }).place.text.length).toBe(MAX_QUOTE_CHARS);
  });
});

describe('where the bar sits', () => {
  const view = { w: 1440, h: 900 };
  const bar = { w: 160, h: 34 };
  it('centred above the first line selected', () => {
    expect(barSpot({ top: 400, bottom: 420, left: 500, right: 700 }, { top: 400, bottom: 460, left: 200, right: 900 }, bar, view)).toEqual({ left: 520, top: 358 });
  });
  it('under the last line when the first is too near the top', () => {
    expect(barSpot({ top: 20, bottom: 40, left: 500, right: 700 }, { top: 20, bottom: 80, left: 200, right: 900 }, bar, view)).toEqual({ left: 520, top: 88 });
  });
  it('kept inside the window at either side', () => {
    expect(barSpot({ top: 400, bottom: 420, left: 0, right: 20 }, { top: 400, bottom: 420, left: 0, right: 20 }, bar, view).left).toBe(8);
    expect(barSpot({ top: 400, bottom: 420, left: 1420, right: 1440 }, { top: 400, bottom: 420, left: 1420, right: 1440 }, bar, view).left).toBe(1440 - 160 - 8);
  });
});

describe('the comments are painted again only when they change', () => {
  it('the same comments in a new list are the same key', () => {
    expect(quotesKey([{ id: 'n1', text: 'a' }])).toBe(quotesKey([{ id: 'n1', text: 'a' }]));
  });
  it('a changed quote or a new comment is a new key', () => {
    expect(quotesKey([{ id: 'n1', text: 'a' }])).not.toBe(quotesKey([{ id: 'n1', text: 'b' }]));
    expect(quotesKey([{ id: 'n1', text: 'a' }])).not.toBe(quotesKey([{ id: 'n1', text: 'a' }, { id: 'n2', text: 'a' }]));
  });
});

describe('the file view', () => {
  const stage = fs.readFileSync(new URL('../renderer/src/components/ArtifactStage.tsx', import.meta.url), 'utf8');
  it('no longer starts a comment when the mouse is let go', () => {
    expect(stage).not.toMatch(/onMouseUp=\{\(\) => \{\s*const picked = window\.getSelection\(\)/);
    expect(stage).not.toContain('removeAllRanges');
  });
  it('offers the bar on a document, on code and on a table', () => {
    expect(stage.match(/<SelectionBar /g)?.length).toBe(3);
  });
  it('draws a document once per text, not once per redraw of the view', () => {
    expect(stage).toMatch(/const MarkdownBody = memo\(/);
  });
});
