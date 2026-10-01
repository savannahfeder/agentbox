// WHAT A RUN CHANGED, AT THE RIGHT-HAND END OF THE BYLINE —.
//
// The picture she meant had the change open on the right, the card squeezed to
// a 339-point column, and the byline broken into three ragged lines. So there
// are two halves guarded here and the second is the half she asked for:
//
//   1. WHAT THE LINE SAYS. Figures out of a real saved change, a zero side left
//      off, thousands separated, "1 file" rather than "1 files", and nothing at
//      all on a row whose run changed no code.
//   2. THAT IT SURVIVES A NARROW CARD. The left of the line is one element that
//      shortens with an ellipsis, the figures never shrink and never break, and
//      under the width where all of it fits the words "in 18 files" come off
//      before the two coloured numbers do.
//
// The second half is read off the stylesheet and the component rather than a
// window, in the way the rest of these tests read them: what a browser did with
// it is measured, and those numbers are in
// decisions.md under this round.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { figuresFrom, figure, signed, fileCount, figuresLabel } from '../renderer/src/change-figures.ts';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const raw = fs.readFileSync(path.join(ROOT, 'renderer', 'src', 'styles.css'), 'utf8');
const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');
const focus = fs.readFileSync(path.join(ROOT, 'renderer', 'src', 'components', 'Focus.tsx'), 'utf8');
// THE LINE ITSELF LIVES HERE NOW: she picked the turning mark to lead it, so
// the arrangement moved out of Focus. The figures did not move with it. They
// are still built in Focus and handed over as a child, so there is exactly
// one of them in the app.
const byline = fs.readFileSync(path.join(ROOT, 'renderer', 'src', 'components', 'Byline.tsx'), 'utf8');

/** Every declaration block whose selector list holds this exact selector. */
function rulesFor(selector, source = css) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(source))) {
    if (m[1].split(',').some((s) => s.trim() === selector)) out.push(m[2].trim());
  }
  return out;
}

/** A real change, in the shape the supervisor writes it. */
const change = (over = {}) => ({
  item: 'w-000e11c85b',
  files: [{ path: 'main/artifacts.mjs', hunks: [], plus: 362, minus: 2 }],
  plus: 2199,
  minus: 48,
  ...over,
});

describe('what the line says', () => {
  it('reads the three figures off a saved change', () => {
    expect(figuresFrom(change())).toEqual({ files: 1, plus: 2199, minus: 48 });
  });

  it('says nothing at all when there is no change to say', () => {
    expect(figuresFrom(null)).toBe(null);
    expect(figuresFrom(undefined)).toBe(null);
    expect(figuresFrom({})).toBe(null);
    expect(figuresFrom('runs/w-1/the-change-it-made.change')).toBe(null);
  });

  it('says nothing for a run that touched no file and moved no line', () => {
    expect(figuresFrom(change({ files: [], plus: 0, minus: 0 }))).toBe(null);
    expect(figuresFrom(change({ plus: 0, minus: 0 }))).toBe(null);
  });

  it('separates thousands, because +2,199 is read and +2199 is counted', () => {
    expect(figure(2199)).toBe('2,199');
    expect(figure(48)).toBe('48');
    expect(figure(-48)).toBe('48');
  });

  // A run that only added lines printing "−0" is a number she has to read in
  // order to discard, and 13 of the 30 changes saved on this product removed no
  // lines at all.
  it('leaves a zero side off entirely', () => {
    expect(signed({ plus: 276, minus: 0 })).toEqual([{ sign: '+', text: '+276' }]);
    expect(signed({ plus: 0, minus: 15 })).toEqual([{ sign: '−', text: '−15' }]);
    expect(signed({ plus: 2199, minus: 48 })).toEqual([
      { sign: '+', text: '+2,199' },
      { sign: '−', text: '−48' },
    ]);
  });

  it('uses U+2212 for the minus, the one the code pane already uses', () => {
    expect(signed({ plus: 0, minus: 48 })[0].text.charCodeAt(0)).toBe(0x2212);
  });

  it('counts files in words a person writes', () => {
    expect(fileCount({ files: 1 })).toBe('1 file');
    expect(fileCount({ files: 18 })).toBe('18 files');
    expect(figuresLabel({ files: 18, plus: 2199, minus: 48 })).toBe('+2,199 −48 in 18 files');
  });
});

describe('that it survives a narrow card', () => {
  // WITH THE CODE OPEN THE CARD IS A 339-POINT COLUMN. This is the fault in the
  // picture she was looking at: a flex row full of loose text nodes breaks
  // wherever it likes. One element that shortens instead is the fix.
  it('draws the left of the byline as one element that shortens', () => {
    // Nothing about this rule changed when the line moved out of Focus: the
    // left of it is still ONE element and it still shortens with an ellipsis
    // rather than breaking wherever the flex row likes.
    expect(byline).toMatch(/className="fm-said"/);
    const [rule] = rulesFor('.fm-said');
    expect(rule).toBeTruthy();
    expect(rule).toMatch(/text-overflow:\s*ellipsis/);
    expect(rule).toMatch(/white-space:\s*nowrap/);
    expect(rule).toMatch(/overflow:\s*hidden/);
    // Without this a flex item will not shorten below its own text.
    expect(rule).toMatch(/min-width:\s*0/);
  });

  it('never lets the figures shrink or break', () => {
    const [rule] = rulesFor('.change-figures');
    expect(rule).toBeTruthy();
    expect(rule).toMatch(/flex:\s*0 0 auto/);
    expect(rule).toMatch(/white-space:\s*nowrap/);
    // margin-left: auto is the whole of the placement: it closes the line at
    // the card's right edge, which is where her arrow landed.
    expect(rule).toMatch(/margin-left:\s*auto/);
  });

  // The card's width, not the window's: opening the code takes 72% of the
  // window and can be dragged to 75%, so a media query would be measuring the
  // wrong thing.
  it('measures the card and not the window', () => {
    expect(rulesFor('.focus-head')[0]).toMatch(/container:\s*card \/ inline-size/);
    expect(css).toMatch(/@container card \(max-width: \d+px\)/);
  });

  it('drops the count of files before it touches the two numbers', () => {
    const block = css.match(/@container card \(max-width: \d+px\)\s*\{([\s\S]*?)\}\s*\}/);
    expect(block).toBeTruthy();
    expect(block[1]).toMatch(/\.cf-files\s*\{[^}]*display:\s*none/);
    expect(block[1]).not.toMatch(/code-plus|code-minus/);
  });

  // The figures left this line on w-e731ca9376 (2026-10-01) for the code row
  // of the thread's menu, where they are the row's detail and the row is the
  // press. Everything above about what they say is unchanged.
  it('presses through to the same change the chip in the conversation opens', () => {
    expect(focus).toMatch(/const changeFigures = figures \? \(\s*<span className="change-figures"/);
    expect(focus).toMatch(/change=\{changeFigures\}\s*onViewChange=\{\(\) => onOpenDoc\?\.\(changePathFor\(item\.id\)\)\}/);
  });

  // NOT ONE NEW COLOUR. --code-plus and --code-minus are the code pane's own
  // two, already answered by dark, by light and by every picture theme.
  it('borrows the two colours the code pane already uses', () => {
    expect(focus).toMatch(/'code-plus' : 'code-minus'/);
    expect(rulesFor('.code-plus')[0]).toMatch(/var\(--code-plus\)/);
    expect(rulesFor('.code-minus')[0]).toMatch(/var\(--code-minus\)/);
  });
});
