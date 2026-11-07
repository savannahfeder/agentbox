// THE WALK'S COACHING CARD IS GLASS, AND IT STILL SAYS EVERYTHING IT SAID.
//
// She took the glass with the words kept.
//
// WHAT THIS FILE HOLDS IS THE TWO HALVES OF WHAT SHE PICKED:
//
// 1. THE CARD IS GLASS, with a painted floor under the blur and a fallback for
// a Mac that cannot blur, so the same card is legible on every beat. 2. THE
// CARD STILL SAYS EVERYTHING IT SAID. She did not take those looks, so the
// quiet line and the lights stay on the card.
//
// AND THE THIRD LINE CAME OFF ON 2026-08-28 WITHOUT REOPENING ANY OF THAT.The
// difference from the looks she rejected is the whole point — every one of
// those sentences is still said, folded into the two lines that remain, rather
// than deleted to make a card look shorter. The budget and the folds are held
// by tests/the-coaching-card-is-two-lines.test.mjs.
//
// AND WHAT IS DELIBERATELY NOT RE-ASKED.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const css = read('renderer/src/styles.css');
const card = read('renderer/src/components/Onboarding.tsx');

/*
 * JUST THE CARD'S OWN RULE, BOUNDED AT BOTH ENDS. A slice with one end open is
 * a claim about the whole stylesheet and will not hold. */
const rule = (() => {
  const from = css.indexOf('\n.fr-tether {');
  expect(from, '.fr-tether').toBeGreaterThan(-1);
  const to = css.indexOf('\n}', from);
  expect(to).toBeGreaterThan(from);
  return css.slice(from, to);
})();

describe('the card is glass', () => {
  it('lets the wallpaper through', () => {
    expect(rule).toMatch(/backdrop-filter:\s*blur\(/);
    expect(rule).toMatch(/-webkit-backdrop-filter:\s*blur\(/);
  });

  // THE FLOOR UNDER THE CONTRAST IS THE POINT, not the blur. A pure blur over a
  // dark photograph goes near-black in the shadows and near-white in the sky,
  // so the same card would be readable on one beat and not on the next. The
  // background is still painted, at 62% of the raised colour.
  it('still paints a background rather than only blurring one', () => {
    expect(rule).toMatch(/background:\s*color-mix\([^)]*--bg-raised/);
    expect(rule).not.toMatch(/background:\s*(transparent|none)\s*;/);
  });

  // A MAC THAT CANNOT BLUR GETS THE SLAB BACK, rather than a transparent card
  // nobody can read.
  it('falls back to the slab where there is no blur', () => {
    const guard = css.indexOf('@supports not ((backdrop-filter');
    expect(guard).toBeGreaterThan(-1);
    const after = css.slice(guard, guard + 400);
    expect(after).toContain('.fr-tether { background: var(--bg-raised); }');
  });
});

describe('the option set is closed', () => {
  // NOTHING IS STILL SWITCHABLE. `?coach=` and the three losing looks are
  // deleted, not hidden below: anything still switchable is something she has
  // to decide a second time.
  it('leaves no way to switch back to one of the looks she did not pick', () => {
    expect(css).not.toContain('data-coach');
    expect(fs.existsSync(path.join(root, 'renderer/src/coach-look.ts'))).toBe(false);
    expect(read('renderer/src/App.tsx')).not.toContain('coach-look');
  });
});

describe('the words she asked for are still on it', () => {
  // THE CUT LOOKS TOOK THESE OFF THE CARD. She did not take those looks, so
  // both are rendered unconditionally: the quiet line saying where you are and
  // the lights counting the presses (hers, 2026-08-23).
  it('renders the quiet line and the lights with nothing gating them', () => {
    for (const bit of ['className="fr-quiet"', '<Lights']) {
      expect(card, bit).toContain(bit);
    }
    expect(card).not.toContain('saysOneThing');
  });

  // AND THERE IS NO THIRD LINE LEFT TO GATE, on this look or any other. It is
  // gone from the drawing and gone from the stylesheet, so a later session
  // cannot bring it back by uncommenting one of the two.
  it('has no third line on the card any more', () => {
    // The class, not the word: both files carry a paragraph SAYING the third
    // line was taken off and why, and a test that forbids the explanation is a
    // test that gets the explanation deleted.
    expect(card).not.toContain('className="fr-why"');
    expect(css).not.toMatch(/\.fr-why\s*\{/);
  });
});
