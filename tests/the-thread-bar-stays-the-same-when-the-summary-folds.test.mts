// THE THREAD BAR STAYS THE SAME WHEN THE SUMMARY FOLDS (w-20292d329f).
//
// What broke: w-922f66bb06 gave a thread a thin bar, "WAITING / THE NAME",
// only while its summary was open. Folding the summary swapped the bar back
// to the tall one (back arrow, the title, PROJECT · ENGINE · LAST MOVED), so
// the top of the screen jumped from 56 to 88 high and changed its whole look
// every time the summary was opened or closed. Measured 2026-10-04 off the
// source: the crumb was chosen by `summaryShown && crumbFrom`, and
// summaryShown is false whenever the summary is folded. Asked for the same
// day: "Let's not change the bar at the top here based on whether the summary
// is expanded or condensed."
//
// So the crumb followed whether the thread HAS a summary (summaryOffered), not
// whether it is open, and a thread with none (an agent's, a conversation, an
// opened design) kept the full bar. Since 2026-10-24 those wear the crumb too:
// "when you click into an inbox item, the header should be this one ... I
// believe you're using an old header from before, which is no longer active"
// (tests/every-opened-thread-wears-the-trail-header).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
const barRule = focus.match(/const barContent = ([^;]*);/)?.[1] ?? '';

describe('the thread bar does not depend on the summary', () => {
  it('draws the crumb whenever the app names where the thread was opened from', () => {
    // Unless it is a person's chat drawn inside Chats, which wears the Chats bar.
    expect(barRule).toMatch(/^inChats\s*\?[\s\S]*?:\s*crumbFrom\s*\?\s*<><ThreadCrumb/);
  });
  it('never asks whether the summary is open, or whether there is one', () => {
    expect(barRule).not.toMatch(/summaryShown|summaryOpen|summaryOffered/);
  });
  it('keeps the full bar only when the app gives no tab to name', () => {
    expect(barRule).toMatch(/:\s*<>\{backButton\}\{bandLine\}<\/>$/);
  });
});
