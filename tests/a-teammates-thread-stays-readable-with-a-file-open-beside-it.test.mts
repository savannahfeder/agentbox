// A TEAMMATE'S THREAD STAYS READABLE WITH A FILE OPEN BESIDE IT.
//
// Found by the team test on w-1fc102959f (2026-11-09) and photographed in two
// copies: Maya opened Theo's prototype page from his thread, the page took the
// right half of the window, and the thread squeezed into the rest with its
// two columns kept. Theo's message wrapped one letter per line, the About card
// lay over the conversation and the buttons broke across lines; a tester read
// it as the page not opening at all. The page's narrow layout was keyed to the
// window (@media max-width 1100px), and opening a file narrows the page, not
// the window.
//
// Pinned: the page measures itself, its two columns become one inside that
// measure, and no rule for it is left keyed to the window.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../renderer/src/threads/pages.css', import.meta.url), 'utf8');
const block = (open) => { const at = css.indexOf(open); return at < 0 ? '' : css.slice(at, css.indexOf('\n}', at)); };

describe("a teammate's thread page", () => {
  it('measures its own width', () => {
    expect(css).toMatch(/\.tp-page \{[^}]*container: tp \/ inline-size/);
  });

  it('becomes one column when it is narrow, whatever the window', () => {
    const narrow = block('@container tp (max-width: 980px)');
    expect(narrow).toMatch(/\.tp-grid \{ grid-template-columns: minmax\(0, 1fr\)/);
    expect(narrow).toMatch(/\.tp-side \{ position: static/);
  });

  it('lets its buttons wrap whole rather than break their words', () => {
    expect(block('@container tp (max-width: 720px)')).toMatch(/\.tp-acts > \* \{ white-space: nowrap/);
  });

  it('keys none of its layout to the window', () => {
    for (const m of css.matchAll(/@media[^{]*\{([\s\S]*?)\n\}/g)) expect(m[1]).not.toMatch(/\.tp-(grid|side|bar|acts)\b/);
  });
});
