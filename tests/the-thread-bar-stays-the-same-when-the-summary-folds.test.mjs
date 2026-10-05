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
// So the crumb follows whether the thread HAS a summary (summaryOffered), not
// whether it is open. A thread that has none (an agent's, a conversation, an
// opened design) never had the crumb and keeps the full bar.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
const barRule = focus.match(/const barContent = ([^;]*);/)?.[1] ?? '';

describe('the thread bar does not depend on the summary being open', () => {
  it('draws the crumb whenever the thread has a summary, open or folded', () => {
    expect(barRule).toMatch(/^summaryOffered && crumbFrom\s*\?\s*<ThreadCrumb/);
  });
  it('never asks whether the summary is open', () => {
    expect(barRule).not.toMatch(/summaryShown|summaryOpen/);
  });
  it('keeps the full bar for a thread with no summary at all', () => {
    expect(barRule).toMatch(/:\s*<>\{backButton\}\{bandLine\}<\/>$/);
    // Agents, conversations, things made and an opened design have no summary,
    // and so no crumb.
    expect(focus).toMatch(/const summarised = !agent && !made && !direct;/);
    expect(focus).toMatch(/const summaryOffered = summarised && !openDoc;/);
  });
  it('keeps the full bar when the app gives no tab to name', () => {
    expect(barRule).toMatch(/&& crumbFrom/);
  });
});
