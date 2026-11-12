// THE TUTORIAL'S FIRST TWO CARDS STAND OVER NEEDS YOU, THE TAB THEY NAME.
//
// Measured on the QA box, 2026-10-23, replaying the tutorial on a copy of the
// app that had been left on another tab: card one, "This is your inbox. Each
// row is a thread", came up over the LATER tab with one scheduled row under it,
// while the badge beside it read NEEDS YOU 4. The walk drives the app from the
// step it is on, and these two beats were the only coached ones that drove
// nothing, so they inherited whatever view the app was last left on.
//
// Both cards name the tabs, so both start on the first of them. The beats that
// are a tour of the OTHER tabs (`where`) still drive nothing, because the
// person presses Tab themselves and forcing a view would undo their press.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COACHED, UNDER, coach } from '../renderer/src/onboarding.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = fs.readFileSync(path.join(root, 'renderer/src/App.tsx'), 'utf8');

describe('the two cards that name the tabs', () => {
  it('open on the inbox, with nothing over it and the first row picked', () => {
    expect(app).toContain("if (run.step === 'tour' || run.step === 'tabs') { setFocused(null); setModal(null); setView('inbox'); setSelected(0); }");
  });

  it('name Needs you before the tabs further along the strip', () => {
    // The card reads quiet line first, loud line second.
    expect(coach('tabs', 0).quiet).toMatch(/^Needs you/);
    expect(coach('tabs', 0).lead).toMatch(/^Later/);
    expect(coach('tour', 0).quiet).toMatch(/inbox/);
  });

  it('and stand under the list rather than over the strip they ring', () => {
    // A card is 147 to 173 tall and the strip is 54, so beside a tab it covered
    // the strip, the column headers and the first row.
    expect(UNDER.tour).toBeUndefined();
    expect(UNDER.tabs).toBe('.list-pane .row:last-of-type');
  });
});

describe('the tour of the other tabs', () => {
  // THE CASE THAT MUST NOT MATCH. `where` is the beat the walk does not drive:
  // the person presses Tab and the card follows them, so a view forced here
  // would put the screen back on Inbox a moment after they left it.
  it('is still left to the person, and only cleared of anything on top', () => {
    expect(app).toContain("if (run.step === 'where') { setModal(null); setFocused(null); }");
    expect(app).not.toMatch(/if \(run\.step === 'where'\) \{[^}]*setView/);
  });

  it('is still one of the coached beats, with the two before it', () => {
    for (const step of ['tour', 'tabs', 'where']) expect(COACHED).toContain(step);
  });
});
