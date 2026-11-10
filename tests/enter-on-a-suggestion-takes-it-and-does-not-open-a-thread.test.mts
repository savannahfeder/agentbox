// ENTER ON A SUGGESTION TAKES IT AND DOES NOT OPEN A THREAD (w-fbe5e95dea, 2026-11-10).
//
// Walking the new first run by hand, the walkthrough's first tip on Home says
// "Press ↓ to choose a suggestion". ↓ lit the first suggestion, and Enter then
// opened the top thread in Needs you instead of taking it: Home's own key
// handler (↓ and Enter walk Needs you) listens first, in the capture phase, and
// stood aside only for text boxes, not for the suggestion buttons under the New
// thread box. No thread was sent, and the walkthrough jumped to "Write back".
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const home = fs.readFileSync(new URL('../renderer/src/home/HomePage.tsx', import.meta.url), 'utf8');

describe("Home's keys", () => {
  it('stand aside for anything in the New thread box, its suggestions included', () => {
    expect(home).toMatch(/closest\('[^']*\.tc-card[^']*'\)/);
  });
  it('still stand aside for text boxes and dialogs', () => {
    expect(home).toMatch(/closest\('input, textarea, \[contenteditable="true"\], \.modal/);
  });
  it('stand aside while the first-run setup is over the app', () => {
    expect(home).toMatch(/hasAttribute\('data-setup'\)/);
  });
});
