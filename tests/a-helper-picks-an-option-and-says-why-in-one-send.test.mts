// A HELPER PICKS AN OPTION AND SAYS WHY IN ONE SEND (2026-11-20).
//
// Round 3: Priya, helping Lena, opened the html from the thread, came back,
// typed her reasons and pressed option 1. Only "Go with the quiet one…"
// reached Lena (her ledger); the reasons she typed were nowhere. When she
// typed them again, the box had renamed itself "Comment to Lena" mid-typing,
// because the option had already answered the step, and her reasons waited
// as a comment. A press on an option now picks it, as the owner's own picker
// does, and the one send carries the option and the words together; a second
// press on the picked option sends. The box keeps its name until it sends,
// and what is typed in it survives opening a file and coming back.
// Measured on the pick rule and by reading the page.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { helperPress, helperAnswer } from '../renderer/src/threads/TeammateThread.tsx';

const options = [{ n: 1, text: 'Go with the quiet one (recommended)', recommended: true }, { n: 2, text: 'The bold one', recommended: false }];

describe('pressing an option', () => {
  it('picks it first, and sends nothing', () => {
    expect(helperPress(null, 1)).toEqual({ picked: 1, send: false });
    expect(helperPress(2, 1)).toEqual({ picked: 1, send: false });
  });
  it('sends on a second press of the picked option', () => {
    expect(helperPress(1, 1)).toEqual({ picked: 1, send: true });
  });
});

describe('the one send', () => {
  it('carries the picked option and the reasons together', () => {
    expect(helperAnswer(options, 1, ' Calm, says one thing. Button: Book a visit. ')).toBe('Go with the quiet one\n\nCalm, says one thing. Button: Book a visit.');
  });
  it('is the option alone, or the words alone, when that is all there is', () => {
    expect(helperAnswer(options, 2, '')).toBe('The bold one');
    expect(helperAnswer(options, null, 'Neither, keep the old one.')).toBe('Neither, keep the old one.');
    expect(helperAnswer(options, null, '  ')).toBe('');
  });
});

describe('the page', () => {
  const page = fs.readFileSync(new URL('../renderer/src/threads/TeammateThread.tsx', import.meta.url), 'utf8');
  it('shows the picked option in the owner\'s picker, and the send button takes it', () => {
    expect(page).toContain('selectedOption={picked}');
    expect(page).toContain('disabled={!helperAnswer(options, picked, draft) || sending}');
  });
  it('keeps the box\'s name until it sends', () => {
    expect(page).toContain('const answering = helping || answeringKept;');
    expect(page).toContain("const box = answering ? 'What should the agent do next?' : `Reply to ${owner}`;");
  });
  it('keeps what is typed across a file opened and closed', () => {
    expect(page).toMatch(/sessionStorage\.setItem\(draftKey/);
  });
});
