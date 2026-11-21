// A COMMENT ON A TEAMMATE'S THREAD SAYS WHO GETS IT (2026-11-12).
//
// Two testers, four times in one round: "The textarea says Comment to Theo,
// but the button only says Comment." A note on a file already says "Send to
// Lena" (artifact-pins noteSendWords), so the comment's button said the same.
// 2026-11-21: the box is the thread's own reply box, and who gets it is said
// beside Send, as it is there. Measured by drawing the box.
import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommentBox } from '../renderer/src/threads/TeammateThread.tsx';

const box = (helping = false) => renderToStaticMarkup(React.createElement(CommentBox, {
  owner: 'Theo', helping, draft: 'Looks right to me', setDraft() {}, sending: false, onSend() {}, open: true, onOpen() {}, onFold() {},
}));

describe("the comment box on a teammate's thread", () => {
  it('says who gets it beside Send, as the reply box does', () => {
    expect(box()).toMatch(/<span class="dim">Goes to Theo\.<\/span><\/span><span class="dock-send-pair solo"><button type="submit" class="dock-send"/);
    expect(box(true)).toContain('<span class="dim">Goes to Theo&#x27;s agent.</span>');
  });
  it('still says what the box is for', () => {
    expect(box()).toContain('placeholder="Reply to Theo"');
    expect(box(true)).toContain('placeholder="Write to Theo&#x27;s agent"');
  });
  it('has no button that says only Comment', () => {
    expect(box()).not.toMatch(/>Comment( <kbd>[^<]*<\/kbd>)?(<svg[\s\S]*?<\/svg>)?<\/button>/);
  });
});
