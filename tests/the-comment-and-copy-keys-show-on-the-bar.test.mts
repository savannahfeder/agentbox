// THE COMMENT AND COPY KEYS SHOW ON THE BAR (w-07c0b010fd, 2026-11-28).
//
// Asked for: "it would really benefit me to be able to automatically and
// visibly see the shortcuts for comment and copy because I'm always
// forgetting them." The bar over selected words said ⌘/ only on a hover
// plate, and Copy said no key at all. Two rounds of pictures settled the look:
// each key right after its own word on a small soft cap with no border, and a
// thin line between Comment and Copy so ⌘/ cannot read as Copy's key.
// Measured by reading both bars and the stylesheet.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { COMMENT_CHORD, COPY_CHORD } from '../renderer/src/selection-bar.ts';
import { chordOf } from '../shared/key-caps.mts';
import { HINTS } from '../renderer/src/hint-plate.ts';

const read = (p: string) => fs.readFileSync(new URL(`../renderer/src/${p}`, import.meta.url), 'utf8');
const bar = read('components/SelectionBar.tsx');
const css = read('components/artifact-view.css');

describe('the keys', () => {
  it('are ⌘/ and ⌘C on a Mac, Ctrl+/ and Ctrl+C elsewhere', () => {
    expect([chordOf(COMMENT_CHORD, true), chordOf(COPY_CHORD, true)]).toEqual(['⌘/', '⌘C']);
    expect([chordOf(COMMENT_CHORD, false), chordOf(COPY_CHORD, false)]).toEqual(['Ctrl+/', 'Ctrl+C']);
  });
});

describe('both bars, over a document and over a page', () => {
  it('print each key right after its own word', () => {
    expect(bar.match(/<CommentGlyph \/>Comment<kbd className="selection-bar-key">\{chord\(COMMENT_CHORD\)\}<\/kbd>/g)?.length).toBe(2);
    expect(bar.match(/\{copied \? 'Copied' : 'Copy'\}<kbd className="selection-bar-key">\{chord\(COPY_CHORD\)\}<\/kbd>/g)?.length).toBe(2);
  });
  it('draw a line between Comment and Copy', () => {
    expect(bar.match(/<\/button>\s*<span className="selection-bar-line" aria-hidden="true" \/>\s*<button/g)?.length).toBe(2);
  });
  it('carry no hover plate, since the key is already on the button', () => {
    expect(bar).not.toContain('data-hint="comment"');
    expect(HINTS.comment).toBeUndefined();
  });
});

describe('the cap', () => {
  const rule = (sel: string) => css.match(new RegExp(`${sel.replace(/\./g, '\\.')} \\{([^}]*)\\}`))?.[1] ?? '';
  it('is a soft fill with rounded corners and no border', () => {
    const cap = rule('.selection-bar-key');
    expect(cap).toContain('background: var(--wash)');
    expect(cap).toMatch(/border-radius: (?!0)/);
    expect(cap).not.toMatch(/border:/);
  });
  it('the line is the theme\'s own hairline', () => {
    expect(rule('.selection-bar-line')).toContain('background: var(--line)');
  });
});
