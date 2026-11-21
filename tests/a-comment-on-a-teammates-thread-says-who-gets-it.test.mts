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
  it('names the owner on its button, as a file note does', () => {
    expect(page).toContain('<button type="submit" disabled={!draft.trim() || sending}>Send to {owner}</button>');
  });
  it('still says what the box is for', () => {
    expect(page).toContain('placeholder={`Comment to ${owner}`}');
  });
  it('has no button that says only Comment', () => {
    expect(page).not.toMatch(/>Comment<\/button>/);
  });
});
