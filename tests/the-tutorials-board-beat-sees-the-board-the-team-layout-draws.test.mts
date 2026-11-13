// THE TUTORIAL'S BOARD BEAT SEES THE BOARD THE TEAM LAYOUT DRAWS (w-fbe5e95dea, 2026-11-10).
//
// Both synthetic testers in the third round pressed B on the tutorial's board
// beat, saw the board, and were still told "Press B or click View and filters,
// then Board", with no way on. With teammates or rooms on, the inbox draws its
// board from the team layout's own view (`mineBoard`), while the beat watched
// `inboxDisplay.view`, which B no longer changed there. The beat and the page
// now read the same answer.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');

describe("the tutorial's board beat", () => {
  it('has one answer for whether the board is drawn', () => {
    expect(app).toMatch(/const boardDrawn = teamMode \? mineBoard : search === null && inboxDisplay\.view === 'board';/);
  });
  it('is told by it, and ends by it', () => {
    expect(app).toMatch(/board=\{boardDrawn\}/);
    expect(app).toMatch(/if \(boardDrawn\) \{ boardSeen\.current = true; return; \}/);
  });
  it('the page draws by it', () => {
    expect(app).toMatch(/\{boardDrawn && !roomShown \? \(<>/);
  });
});
