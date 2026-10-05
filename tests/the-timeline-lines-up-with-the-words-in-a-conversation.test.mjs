// THE TIMELINE LINES UP WITH THE WORDS IN A CONVERSATION (w-2b0cd0f741).
//
// What broke, seen on a conversation with a teammate on 2026-10-05: the
// "Snoozed until 3:36pm" lines started at the faces' edge, 42px left of every
// name and message around them. Measured in the built renderer: message text
// at x=452, the timeline's words at x=430 and its ring at x=410. Now the words
// start at 452 like the text, and the ring sits centred under the faces.
//
// An agent's thread has no faces, so its timeline stays where it was.

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

  it('starts the words where the text starts: the 28px face and its 14px gap', () => {
    expect(chat).toMatch(/grid-template-columns: 28px minmax\(0, 1fr\); column-gap: 14px/);
    expect(chat).toMatch(/\.thread\.is-chat \.act-line, \.act-after\.is-chat \.act-line \{ padding-left: 42px; \}/);
  });

  it('centres the ring, and the hairline through it, under the faces', () => {
    // A 7px ring centred on a 28px face: 14 - 3.5. The 1px hairline: 14 - 0.5.
    expect(chat).toMatch(/\.act-line::before \{ left: 10\.5px; \}/);
    expect(chat).toMatch(/\.act-line::after \{ left: 13\.5px; \}/);
  });

  it('moves the line that hands a message to an agent with the words', () => {
    expect(chat).toMatch(/\.ts-hand \{ padding-left: 42px; \}/);
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
