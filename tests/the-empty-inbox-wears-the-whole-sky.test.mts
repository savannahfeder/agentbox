// THE EMPTY INBOX WEARS THE WHOLE SKY (w-5c44f85857, approved 2026-11-13 as
// heading-2-clearing-v2).
//
// "Nothing needs you" drew the sky only as a strip under the header, masked out
// by 150px, so the page was a dark slab with a band cut off at the top. The
// owner wanted it to take up more. Two rounds were turned down on the way:
// Home's streak ran straight behind the heading ("looks weird"), and a clearing
// cut out of the sky round the words ("dont cut out the backgrond"). What was
// approved fills the whole card with dots and lays the streak out below the
// writing box, so no word sits on it. Measured on screenshots of the built
// renderer in the orange, purple and green skies.
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { emptyInboxSky, SKY_THEMES } from '../renderer/src/home/sky.ts';

const read = (p: string) => fs.readFileSync(new URL(`../renderer/src/${p}`, import.meta.url), 'utf8');
const css = read('home/home.css');
const pages = read('threads/Pages.tsx');
const app = read('App.tsx');

const H = 1130;
const darkSkies = SKY_THEMES.filter((s) => s.dark);

// Where the streak's centre line falls at a point across the card, as drawSky lays it out.
function streakAt(t: number, art: { y0: number; y1: number; bend: number }, curveTop: number) {
  return curveTop + (art.y0 + (art.y1 - art.y0) * t + art.bend * t * (1 - t)) * (H - curveTop);
}

describe('the empty Inbox sky', () => {
  it('starts at the top of the card rather than in a strip', () => {
    expect(emptyInboxSky(700, H).from).toBeLessThanOrEqual(40);
  });

  it('runs its streak below the writing box on every dark sky', () => {
    for (const boxFoot of [520, 700, 860]) {
      const { curveTop } = emptyInboxSky(boxFoot, H);
      for (const sky of darkSkies) {
        for (let t = 0; t <= 1; t += 0.05) expect(streakAt(t, sky.art, curveTop)).toBeGreaterThan(boxFoot);
      }
    }
  });

  it('keeps the streak in the lower half when the box has moved to the dialog', () => {
    expect(emptyInboxSky(0, H).curveTop).toBeGreaterThanOrEqual(H / 2);
  });

  it('is drawn by the empty page, and only where the Inbox wears a sky', () => {
    expect(pages).toMatch(/<InboxSky art=\{sky\} shape="zero" \/>/);
    expect(app).toContain('<InboxClear slot={setClearSlot} first={firstTask(tour)} sky={skyOnInbox && sky ? sky.art : null} />');
  });

  it('replaces the header strip while it is up', () => {
    expect(css).toMatch(/\.app:has\(> \.inbox-sky-zero\) > \.inbox-sky-head \{ display: none; \}/);
  });

  it('cuts nothing out of the sky', () => {
    expect(css).not.toMatch(/\.inbox-sky-zero[^{]*\{[^}]*mask-image/);
  });

  // "font is a bit hard to read", pinned on the placeholder: it was --text-faint straight on the dots.
  // The fix is the text's colour alone. A dark patch behind the words was turned down: "no bg changes".
  it('draws the placeholder a step brighter, with nothing behind the words', () => {
    expect(css).toMatch(/\.app:has\(> \.inbox-sky-zero\) \.th-start \.tc-text::placeholder \{ color: var\(--text-dim\); \}/);
    expect(css).not.toMatch(/\.inbox-sky-zero\)[^{]*\{[^}]*text-shadow/);
  });

  it('fills the chips and Send so the dots never show through their words', () => {
    expect(css).toMatch(/\.app:has\(> \.inbox-sky-zero\) \.th-start \.tc-chip \{[^}]*var\(--sky-under/);
    expect(css).toMatch(/\.app:has\(> \.inbox-sky-zero\) \.th-start \.tc-send \{[^}]*var\(--sky-under/);
  });
});
