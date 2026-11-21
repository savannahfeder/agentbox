// A CHAT'S FILE TILES LINE UP WITH ITS WORDS.
//
// Pinned by the person on w-1fc102959f (2026-11-09), "not properly aligned",
// on a picture of a task Theo handed Maya: the table's tile sat at the left
// edge of the message rows, under the faces, while every word and link it
// belongs to starts 42px in (measured in the copy: tiles at 192px, words at
// 234px; after the change both at 234px). A chat message is a 28px face and a
// 14px gap, then the words; the timeline already moves its lines by the same
// 42px (the-timeline-lines-up-with-the-words-in-a-conversation).
//
// Since 2026-11-20 (w-f702d60afe) the face sits beside the name and the words
// start at the column's edge, so the tiles need no margin to line up with them.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../renderer/src/team/chat.css', import.meta.url), 'utf8');

describe("a chat's file tiles", () => {
  it('start where the words start, at the column\'s edge', () => {
    expect(css).not.toMatch(/message-files \{ margin-left: 42px/);
    expect(css).toMatch(/\.chat-msg > :not\(\.chat-gutter, \.msg-head\) \{ grid-column: 1 \/ -1;/);
  });

  it('move only in a chat', () => {
    expect(css).not.toMatch(/(^|\n)\.message-files \{[^}]*margin-left/);
  });
});
