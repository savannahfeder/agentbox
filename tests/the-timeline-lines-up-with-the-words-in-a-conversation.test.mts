// THE TIMELINE LINES UP WITH THE WORDS IN A CONVERSATION (w-2b0cd0f741).
//
// What broke, seen on a conversation with a teammate on 2026-10-05: the
// "Snoozed until 3:36pm" lines started at the faces' edge, 42px left of every
// name and message around them. Measured in the built renderer: message text
// at x=452, the timeline's ring at x=410. Now the ring starts at 452 like the
// text and the words 20px in, the drawing picked over a ring centred under the
// faces.
//
// An agent's thread has no faces, so its timeline stays where it was. Since
// 2026-11-20 (w-f702d60afe) a conversation's words start at the column's edge
// too, so its timeline needs no margin to line up with them.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const chat = read('renderer/src/team/chat.css');
const styles = read('renderer/src/styles.css');

describe('in a conversation with a person', () => {
  it('marks the thread and the lines under the last message as a conversation', () => {
    expect(read('renderer/src/components/Thread.tsx')).toMatch(/className=\{`thread\$\{chat \? ' is-chat' : ''\}`\}/);
    expect(read('renderer/src/components/ItemThread.tsx')).toMatch(/className=\{`act-after\$\{chat \? ' is-chat' : ''\}`\}/);
  });

  it('starts the whole line where the text starts, at the column\'s edge', () => {
    expect(chat).toMatch(/\.chat-msg > :not\(\.chat-gutter, \.msg-head\) \{ grid-column: 1 \/ -1;/);
    expect(chat).not.toMatch(/\.act-line[^{]*\{[^}]*margin-left/);
  });

  it('moves the ring and its hairline with the line rather than placing them apart', () => {
    expect(chat).not.toMatch(/act-line::(before|after)/);
  });

  it('leaves the line that hands a message to an agent at the words\' edge', () => {
    expect(chat).not.toMatch(/\.ts-hand \{[^}]*padding-left/);
  });
});

describe('in a thread with an agent', () => {
  it('leaves the timeline at the column edge, with nothing in the shared rule moved', () => {
    expect(styles).toMatch(/\.act-line \{\n\s+position: relative;[^}]*padding-left: 20px;/);
    expect(styles).toMatch(/\.act-line::before \{\n\s+content: ''; position: absolute; left: 0;/);
    // Every rule that moves it hangs off the conversation's own class.
    for (const rule of chat.match(/^[^\n{]*act-line[^\n{]*\{/gm) ?? []) expect(rule).toMatch(/is-chat/);
  });
});
