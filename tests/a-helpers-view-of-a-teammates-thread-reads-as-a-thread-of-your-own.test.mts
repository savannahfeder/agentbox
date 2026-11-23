// A HELPER'S VIEW OF A TEAMMATE'S THREAD READS AS A THREAD OF YOUR OWN (2026-11-21).
//
// Lena, asked by Theo to help, opened his thread from her Inbox. Under the same
// crumb as any thread, the page was a layout of its own: the agent's options as
// a plain numbered list under a "Result" label, the table unstyled, and a box
// with its own "Send to the agent" button. The founder: "It should be really
// similar to the structure of our other page." Now its name heads it with what
// came before folded, the newest answer is the headline, the step's options sit
// on the reply box as the owner's picker, and the reply box is the thread's own
// (since w-8a8eac7620 the same pill and card as a thread of your own, which
// stays open while you are asked to help). Measured by reading and drawing the page.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommentBox } from '../renderer/src/threads/TeammateThread.tsx';

const page = fs.readFileSync(new URL('../renderer/src/threads/TeammateThread.tsx', import.meta.url), 'utf8');

describe("a helper's view of a teammate's thread", () => {
  it('is set in the thread page\'s column with its markdown styles', () => {
    expect(page).toContain('<div className="focus-body markdown agent-thread" aria-label="The conversation">');
    expect(page).toContain('<h2 className="one-title">{title}</h2>');
    // Asked onto it, the owner's own choices are left off too (a-reply-to-a-review-hands-it-back).
    expect(page).toContain('<QueueAnswer text={options.length || unfolded ? stripOptionsSection(newest.text) : newest.text}');
    expect(page).not.toContain('appendix-label');
  });
  it('offers the step\'s options on the reply box, not as a list in the answer', () => {
    expect(page).toMatch(/<div className="focus-dock-inner">[\s\S]{0,200}<div className="one-choices">\s*<OptionsOffer/);
    expect(page.indexOf('<OptionsOffer')).toBeLessThan(page.indexOf('<CommentBox '));
    expect(page).toContain('const options = helping && newest && !answered ? parseOptions(newest.text) : [];');
  });
  it('uses the thread\'s own reply box and Send, open while you are asked to help', () => {
    expect(page).toContain('open={boxOpen || helping}');
    const box = renderToStaticMarkup(React.createElement(CommentBox, {
      owner: 'Theo', helping: true, draft: '', setDraft() {}, sending: false, onSend() {}, open: true, onOpen() {}, onFold() {},
    }));
    expect(box).toMatch(/<textarea class="dock-input"/);
    expect(box).toMatch(/<button type="submit" class="dock-send" disabled="" title="[^"]*">Send <kbd>/);
    expect(box).not.toContain('Send to the agent');
  });
});
