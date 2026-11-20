// A NARROW CONVERSATION PUTS THE FACE BESIDE THE NAME (w-f702d60afe, 2026-11-20).
//
// The founder, on Theo's review task with the change open beside it: "this is
// doing some really weird indenting with the profile picture ... Why is all the
// text just indented, taking up very little space?" A chat message keeps a
// 28px face column and a 14px gap down its whole height. Measured in that
// picture: the conversation was 328px wide and the words got 286 of it, so
// "Add an idempotency key to POST /payments" broke over two lines.
//
// Under 560px of pane the face goes on the name's line and the words take the
// whole width; wider, the column stays.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../renderer/src/team/chat.css', import.meta.url), 'utf8');
const narrow = (() => {
  const at = css.indexOf('@container (max-width: 560px)');
  return at < 0 ? '' : css.slice(at, css.indexOf('\n}', at));
})();

describe('a conversation in a narrow pane', () => {
  it('has a rule for a pane under 560px', () => {
    expect(narrow).not.toBe('');
  });
  it('puts the face on the first line only, beside the name', () => {
    expect(narrow).toMatch(/\.chat-gutter \{[^}]*grid-row: 1;/);
  });
  it('gives the words the whole width', () => {
    expect(narrow).toMatch(/\.chat-msg > :not\(\.chat-gutter, \.msg-head\) \{[^}]*grid-column: 1 \/ -1;/);
  });
  it('lines the files up with the words again', () => {
    expect(narrow).toMatch(/> \.message-files \{[^}]*margin-left: 0;/);
  });
  it('keeps the face column when there is room', () => {
    expect(css).toMatch(/^\.chat-msg \{ display: grid; grid-template-columns: 28px minmax\(0, 1fr\); column-gap: 14px; \}/m);
  });
});
