// HANDING BACK SHOWS ITS BUTTON WITHOUT SCROLLING (w-f702d60afe, round six, 2026-11-20).
//
// The designer tester pressed Hand back on Dana's thread: "The note appeared at
// the bottom edge and the final button was off screen. I had to scroll down
// twice to find it." The ask is the last message on the page, so the box for
// the note and its button open under the window's edge. Opening the box now
// brings the whole of it, button included, into view.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const bar = fs.readFileSync(new URL('../renderer/src/team/AskBar.tsx', import.meta.url), 'utf8');

describe('the hand-back box', () => {
  it('is scrolled into view, whole, when it opens', () => {
    expect(bar).toMatch(/useEffect\(\(\) => \{\s*if \(giving\) backBox\.current\?\.scrollIntoView\(\{ block: 'nearest'/);
    expect(bar).toMatch(/<div className="ask-bar-back" ref=\{backBox\}>/);
  });
});
