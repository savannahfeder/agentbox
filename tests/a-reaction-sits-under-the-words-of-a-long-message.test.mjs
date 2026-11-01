// A REACTION SITS UNDER THE WORDS, EVEN ON A LONG MESSAGE.
//
// Reported 2026-10-05 (w-45cbac227a) with a screenshot of a thread at its
// default width: the ✅ chip under a teammate's long message sat under her
// face, 70 points left of the words, while the chips on a short reply sat
// where they should. A chat message is a two-column grid (the face, then the
// words), and only the name, the words and "Show the whole message" were
// told to stand in the second column. The chips found their own place, and a
// short message leaves a free cell beside the face for them while a long one,
// which folds and so draws one line more, does not: they dropped to a new row
// at column one. At a wider panel the same message is short enough not to
// fold, which is why only the default width showed it.
//
// So every part of a message under the face's row is told its column, and the
// test reads the stylesheet for each part a message can draw.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThreadPanel } from '../renderer/src/team/ThreadPanel.tsx';
import { TeamContext } from '../renderer/src/team/people.tsx';

const css = fs.readFileSync(new URL('../renderer/src/team/chat.css', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, body]) => ({ sel: sel.trim(), body }));
const column = (cls) => rules
  .filter((r) => r.sel.split(',').some((s) => new RegExp(`\\.chat-msg\\s*>\\s*\\.${cls}\\s*$`).test(s.trim()) || new RegExp(`^\\.${cls}$`).test(s.trim())))
  .map((r) => r.body.match(/grid-column:\s*([^;]+)/)?.[1]?.trim())
  .filter(Boolean)
  .pop();

describe('the columns of a chat message', () => {
  it('puts the reaction chips in the words column', () => {
    expect(column('chat-chips')).toBe('2');
  });

  it('still puts the name, the words, the fold and the thread line there', () => {
    for (const part of ['msg-head', 'msg-body', 'chat-more', 'chat-thread-line']) expect(column(part), part).toBe('2');
  });

  // THE CASE THAT MUST NOT MOVE: the face keeps the first column.
  it('leaves the face in the first column', () => {
    expect(column('chat-gutter')).toBe('1');
  });
});

describe('the chips in the thread panel', () => {
  const ME = 'p-me', MAYA = 'p-maya';
  const team = { me: ME, state: { people: [] }, byId: new Map([[MAYA, { id: MAYA, name: 'Maya Chen' }], [ME, { id: ME, name: 'Sam Rivera' }]]) };
  const html = renderToStaticMarkup(React.createElement(TeamContext.Provider, { value: team },
    React.createElement(ThreadPanel, {
      parent: { at: 1, who: 'you', by: MAYA, uid: 'u-1', text: 'Long findings.' },
      replies: [],
      md: (t) => t,
      width: 440,
      reactions: { 'u-1': { '✅': [MAYA] } },
      onReact: () => {},
      onSend: () => {},
      onClose: () => {},
      onResize: () => {},
    })));

  // The column rule is a child rule, so the chips must be the message's own child.
  it('are drawn as a direct part of the message, where the column rule reaches them', () => {
    expect(html).toMatch(/<div class="msg chat-msg">[\s\S]*?<div class="chat-chips">/);
    expect(html).not.toMatch(/class="msg-body"><div class="chat-chips"/);
  });
});
