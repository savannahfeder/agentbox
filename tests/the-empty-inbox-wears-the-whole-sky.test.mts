// THE EMPTY INBOX WEARS THE WHOLE SKY (w-5c44f85857, heading-2-clearing
// without its clearing, 2026-11-13).
//
// "Nothing needs you" drew the sky only as a strip under the header, masked out
// by 150px, so the page was a dark slab with a band cut off at the top. The
// owner wanted it to take up more. Turned down on the way, each measured on
// screenshots of the built renderer:
// - a clearing cut out of the sky round the words ("dont cut out the backgrond");
// - the streak moved down under the writing box ("i said not to have moved the
//   placement of things");
// - a dark patch behind the hard-to-read placeholder ("no bg changes").
// - an empty blob where the sky was faded out round the words ("a no (for the
//   30th time) to this big empty blob space").
// What stands is Home's sky, where Home draws it, over the whole card. Only the
// bright line itself is turned down where it passes behind the words ("yes to
// reducing the intensity of the line behind text"); every dot stays.
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { lineStrength } from '../renderer/src/home/sky.ts';

const read = (p: string) => fs.readFileSync(new URL(`../renderer/src/${p}`, import.meta.url), 'utf8');
const css = read('home/home.css');
const pages = read('threads/Pages.tsx');
const app = read('App.tsx');
const inboxSky = read('home/InboxSky.tsx');

describe('the empty Inbox sky', () => {
  it('is drawn where Home draws it, from the top of the card, the streak not moved', () => {
    expect(app).toContain('<SkyBackdrop art={sky.art} from={sky.dark ? 40 : 150} span={sky.dark ? 300 : 240} />');
    expect(inboxSky).toMatch(/shape === 'zero'\) \{ drawSky\(canvas, art, \{ from: 40, span: 300, dpr, quiet: words\(\) \}\); return; \}/);
  });

  describe('turns the line down behind the words without emptying anything', () => {
    const words = { x: 400, y: 300, w: 720, h: 180 };
    it('dims the line inside the words, but never to nothing', () => {
      const s = lineStrength(700, 400, words);
      expect(s).toBeGreaterThan(0.2);
      expect(s).toBeLessThan(0.6);
    });
    it('leaves the line at full strength well away from them', () => {
      expect(lineStrength(100, 900, words)).toBe(1);
      expect(lineStrength(1300, 400, words)).toBe(1);
    });
    it('comes back gradually at the edge, not as a cut', () => {
      const a = lineStrength(1120 + 10, 400, words), b = lineStrength(1120 + 40, 400, words), c = lineStrength(1120 + 80, 400, words);
      expect(a).toBeLessThan(b);
      expect(b).toBeLessThan(c);
    });
    it('is full strength everywhere when there are no words', () => {
      expect(lineStrength(700, 400, null)).toBe(1);
    });
  });

  it('is drawn by the empty page, and only where the Inbox wears a sky', () => {
    expect(pages).toMatch(/<InboxSky art=\{sky\} shape="zero" \/>/);
    expect(app).toContain('<InboxClear slot={setClearSlot} first={firstTask(tour)} sky={skyOnInbox && sky ? sky.art : null} />');
  });

  it('replaces the header strip while it is up', () => {
    expect(css).toMatch(/\.app:has\(> \.inbox-sky-zero\) > \.inbox-sky-head \{ display: none; \}/);
  });

  it('cuts nothing out of the sky and lays nothing over it', () => {
    expect(css).not.toMatch(/\.inbox-sky-zero[^{]*\{[^}]*mask-image/);
    expect(css).not.toMatch(/\.inbox-sky-zero\)[^{]*\{[^}]*(text-shadow|background)/);
  });

  // "font is a bit hard to read", pinned on the placeholder: it was --text-faint straight on the dots.
  it('draws the placeholder and the chips a step brighter', () => {
    expect(css).toMatch(/\.app:has\(> \.inbox-sky-zero\) \.th-start \.tc-text::placeholder \{ color: var\(--text-dim\); \}/);
    expect(css).toMatch(/\.app:has\(> \.inbox-sky-zero\) \.th-start \.tc-chip \{ color: var\(--text\); \}/);
  });
});
