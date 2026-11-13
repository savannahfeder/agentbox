// THE TUTORIAL'S ENDING DOES NOT CALL A FULL INBOX EMPTY (w-fbe5e95dea, 2026-11-10).
//
// Both third-round testers finished the tutorial and read "Your inbox is empty
// and no agent is waiting on you" over their own inbox, with 12 and 56 threads
// in Needs you. The line was picked only by whether the walk kept any agents,
// never by the inbox it was drawn over. It says the empty-inbox line only when
// nothing is waiting.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');

describe("the tutorial's last card", () => {
  it('takes the goal line, not the empty line, whenever anything is waiting', () => {
    expect(app).toMatch(/<Landed agents=\{landing\.agents \|\| inbox\.length \+ leadCount > 0\}/);
  });
});
