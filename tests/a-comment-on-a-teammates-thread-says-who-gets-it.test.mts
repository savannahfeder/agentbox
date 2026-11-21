// A COMMENT ON A TEAMMATE'S THREAD SAYS WHO GETS IT (2026-11-12).
//
// Two testers, four times in one round: "The textarea says Comment to Theo,
// but the button only says Comment." A note on a file already says "Send to
// Lena" (artifact-pins noteSendWords), so the comment's button says the same.
// Measured by reading the teammate thread page's source.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('../renderer/src/threads/TeammateThread.tsx', import.meta.url), 'utf8');

describe("the comment box on a teammate's thread", () => {
  // 2026-11-21: the box is the thread's own reply box; who gets it is said beside Send.
  it('says who gets it beside Send, as the reply box does', () => {
    expect(page).toContain("{helping ? `Goes to ${owner}'s agent.` : `Goes to ${owner}.`}");
  });
  it('still says what the box is for', () => {
    expect(page).toContain("const box = helping ? `Write to ${owner}'s agent` : `Reply to ${owner}`;");
    expect(page).toContain('placeholder={box}');
  });
  it('has no button that says only Comment', () => {
    expect(page).not.toMatch(/>Comment<\/button>/);
  });
});
