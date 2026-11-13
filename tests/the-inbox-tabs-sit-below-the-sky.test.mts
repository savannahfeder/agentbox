// THE INBOX TABS SIT BELOW THE SKY (F-208).
//
// What broke: on the dark purple, orange and green skies the dots ran down
// behind NEEDS YOU / IN PROGRESS / DONE, and the grey tab labels sat inside
// them. The halo behind words on the sky (home.css) clears a title, not 11px
// grey capitals with dots between the letters; green was the worst.
//
// How it was measured: screenshot b014-04 (QA session 41, Nov 9 2026), then
// headless renders of all three dark skies at 1440x900. The sky's box starts
// at the card's top and the first tab's box starts 78px below it, its letters
// at about 88px, so the sky has faded out by 90px.
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';

const css = fs.readFileSync(new URL('../renderer/src/home/home.css', import.meta.url), 'utf8');
const rule = (sel: RegExp) => css.match(sel)?.[0] ?? '';
const fadeEnd = (block: string) => Number(block.match(/mask-image: linear-gradient\(to top,[^)]*transparent (\d+)px\)/)?.[1]);
const solidTo = (block: string) => Number(block.match(/mask-image: linear-gradient\(to top, #000 0, #000 (\d+)px/)?.[1]);

describe('the Inbox sky over the tabs', () => {
  const head = rule(/\.inbox-sky-head \{ transform: scaleY\(-1\);\n[^}]*\}/);

  it('has faded out before the tab labels start', () => {
    expect(fadeEnd(head)).toBeLessThanOrEqual(90);
  });

  it('is still at full strength behind the title and the buttons', () => {
    expect(solidTo(head)).toBeGreaterThanOrEqual(40);
  });

  // The board has no tabs and keeps its own deeper band.
  it('leaves the board its own band', () => {
    const board = rule(/\.app\.sky-board \.inbox-sky-head \{[^}]*\}/);
    expect(fadeEnd(board)).toBe(150);
  });
});
