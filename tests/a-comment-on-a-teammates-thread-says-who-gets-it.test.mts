// A COMMENT ON A TEAMMATE'S THREAD SAYS WHO GETS IT (2026-11-12).
//
// Two testers, four times in one round: "The textarea says Comment to Theo,
// but the button only says Comment." A note on a file already says "Send to
// Lena" (artifact-pins noteSendWords), so the comment's button says the same.
// Since w-8a8eac7620 the box is the reply box's own card and its Send keeps
// the name, beside the key. Measured by drawing the box.
import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommentBox } from '../renderer/src/threads/TeammateThread.tsx';

const box = renderToStaticMarkup(React.createElement(CommentBox, {
  owner: 'Theo', helping: false, draft: 'Looks right to me', setDraft() {}, sending: false, onSend() {}, open: true, onOpen() {}, onFold() {},
}));

describe("the comment box on a teammate's thread", () => {
  it('names the owner on its button, as a file note does', () => {
    expect(box).toMatch(/<button type="submit" class="dock-send"[^>]*>Send to Theo <kbd>/);
  });
  it('still says what the box is for', () => {
    expect(box).toContain('placeholder="Comment to Theo"');
  });
  it('has no button that says only Comment', () => {
    expect(box).not.toMatch(/>Comment( <kbd>[^<]*<\/kbd>)?(<svg[\s\S]*?<\/svg>)?<\/button>/);
  });
});
