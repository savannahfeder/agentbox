// A ⌘K ROW IS ONE LINE, LABEL AND HINT ALIKE.
//
// The founder, on a picture of the import row (w-6418318cd5, 2026-10-16):
// "There is so much text that it's overflowing on both lines." Both halves of
// that row had wrapped — "Import agents from Claude Code or / Codex" over
// "your recent ones, or find an older chat by name · they land in / your
// inbox" — so one row was four lines tall in a list where every other row is
// one.
//
// TWO FAULTS AND BOTH ARE FIXED HERE, because fixing either alone leaves the
// other.
//
//   THE COPY WAS AN OUTLIER. Measured over every row in the palette, that one
//   carried the longest label of the lot (39 characters; the next is 27) and
//   the longest hint (73; the next is 63). It was not a narrow panel, it was
//   one row saying four times what its neighbours say.
//
//   AND THE ROW COULD NOT REFUSE. `.palette-item` is a bare flex with two
//   spans in it and nothing stopping either from wrapping, so ANY long label
//   stacks the row and the next long one will do it again. Now neither half
//   wraps: whichever cannot fit is cut with an ellipsis, which is visible,
//   rather than wrapped, which is what this looked like.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const palette = read('renderer/src/components/Palette.tsx');
const css = read('renderer/src/styles.css');

const labels = [...palette.matchAll(/^\s*label: '([^']+)'/gm)].map((m) => m[1]);
const hints = [...palette.matchAll(/^\s*hint: '([^']+)'/gm)].map((m) => m[1]);

/** The block of rules for one selector, so the assertions read it whole. */
const rule = (selector) => {
  const at = css.indexOf(`\n${selector} {`);
  if (at < 0) return '';
  return css.slice(at, css.indexOf('}', at));
};

describe('the row cannot stack, whatever is put in it', () => {
  it('names its label so a stylesheet can reach it', () => {
    expect(palette).toContain('className="palette-label"');
  });

  it('never wraps the label: it is cut with an ellipsis instead', () => {
    const r = rule('.palette-label');
    expect(r).toMatch(/white-space:\s*nowrap/);
    expect(r).toMatch(/text-overflow:\s*ellipsis/);
    expect(r).toMatch(/overflow:\s*hidden/);
    // Without this a flex child refuses to shrink below its text and overflows
    // the panel instead of truncating, which is the usual way this fix fails.
    expect(r).toMatch(/min-width:\s*0/);
  });

  it('never wraps the hint either', () => {
    const r = rule('.palette-hint');
    expect(r).toMatch(/white-space:\s*nowrap/);
    expect(r).toMatch(/text-overflow:\s*ellipsis/);
    expect(r).toMatch(/overflow:\s*hidden/);
    expect(r).toMatch(/min-width:\s*0/);
  });

  it('keeps the two apart, so a long label never touches its hint', () => {
    expect(rule('.palette-item')).toMatch(/gap:\s*\d/);
  });
});

describe('no row says four times what its neighbours say', () => {
  // The numbers are the rest of the palette, not a taste: before this the
  // import row was 39 and 73 where the next longest were 27 and 63.
  const LABEL_MOST = 27;
  const HINT_MOST = 63;

  it('has no label longer than the longest of the others', () => {
    const over = labels.filter((l) => l.length > LABEL_MOST);
    expect(over).toEqual([]);
  });

  it('has no hint longer than the longest of the others', () => {
    const over = hints.filter((h) => h.length > HINT_MOST);
    expect(over).toEqual([]);
  });

  it('still says both tools and both ways of finding a chat, in English', () => {
    const row = palette.slice(palette.indexOf("id: 'import-agents'"), palette.indexOf("id: 'import-agents'") + 700);
    const label = row.match(/label: '([^']+)'/)[1];
    const hint = row.match(/hint: '([^']+)'/)[1];
    expect(label).toMatch(/import/i);
    expect(`${label} ${hint}`).toMatch(/Claude Code/);
    expect(`${label} ${hint}`).toMatch(/Codex/);
    expect(hint).toMatch(/name/i);
    // The thing this row grew a field for: it is not only the recent ones.
    expect(hint).not.toMatch(/last ten days/i);
  });
});
