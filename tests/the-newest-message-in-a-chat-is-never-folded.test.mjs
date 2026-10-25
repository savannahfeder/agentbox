// THE NEWEST MESSAGE IN A CHAT IS NEVER FOLDED (w-286ad4e81c, 2026-10-20).
//
// "I don't like the premise that, in chats, I have to click to show the whole
// message when I get a new message ... definitely not for the most recent
// message because it basically requires a click to even see it." Their
// screenshot: a teammate's message of findings, the newest thing in the chat,
// cut off after its third point behind "Show the whole message". Every long
// message folded at 430px, whichever one it was.
//
// Now the newest message in the chat, and the newest in a thread's panel, is
// drawn whole with no button under it. One that was the newest while on screen
// stays whole when a newer one lands, so the words being read never fold away.
// Older long messages still fold. Measured by drawing the chat with the fold
// swapped for a stand-in that writes down which message it was told is newest.
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../renderer/src/team/ChatFold.tsx', async (actual) => {
  const real = await actual();
  const React = await import('react');
  return {
    ...real,
    ChatFold: ({ children, newest }) => React.createElement('div', { 'data-fold': newest ? 'newest' : 'older' }, children),
  };
});

const { foldOf } = await vi.importActual('../renderer/src/team/ChatFold.tsx');
const { newestSaid } = await import('../renderer/src/team/chat-layout.ts');
const { Thread } = await import('../renderer/src/components/Thread.tsx');
const { ThreadPanel } = await import('../renderer/src/team/ThreadPanel.tsx');
const { TeamContext } = await import('../renderer/src/team/people.tsx');

const NOW = new Date(2026, 9, 20, 15, 0).getTime();
const at = (h, m) => new Date(2026, 9, 20, h, m).getTime();
const ME = 'p-me', MAYA = 'p-maya';
const said = (by, when, text, uid) => ({ at: when, who: 'you', by, text, ...(uid ? { uid } : {}) });
const act = (when) => ({ kind: 'work', at: when, verb: 'Moved to Later until 6:30pm', subject: '', output: '', lines: 0, failed: false, yours: true, by: ME });
const team = {
  state: {}, me: ME,
  byId: new Map([[ME, { id: ME, name: 'Sam Rivera', email: '', avatarUrl: null }], [MAYA, { id: MAYA, name: 'Maya Chen', email: '', avatarUrl: null }]]),
  products: new Map(),
};
const inTeam = (el) => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(NOW);
  try { return renderToStaticMarkup(React.createElement(TeamContext.Provider, { value: team }, el)); } finally { clock.mockRestore(); }
};
const md = (t) => React.createElement('p', null, t);
const folds = (html) => [...html.matchAll(/data-fold="(\w+)"><p>([^<]*)</g)].map((m) => [m[2], m[1]]);

describe('what a long message draws', () => {
  it('folds an older one, with the way to open it', () => {
    expect(foldOf({ tall: true, kept: false, open: false })).toBe('shut');
  });

  it('opens an older one when asked, with the way to fold it again', () => {
    expect(foldOf({ tall: true, kept: false, open: true })).toBe('open');
  });

  it('draws the newest whole, with no button under it', () => {
    expect(foldOf({ tall: true, kept: true, open: false })).toBe('whole');
  });

  // THE CASE THAT MUST NOT FOLD EITHER: a short message has nothing to hide.
  it('draws a short message whole whether or not it is the newest', () => {
    expect(foldOf({ tall: false, kept: false, open: false })).toBe('whole');
    expect(foldOf({ tall: false, kept: true, open: false })).toBe('whole');
  });
});

describe('which message in a chat is the newest', () => {
  it('is the last message', () => {
    expect(newestSaid([said(MAYA, 1, 'a'), said(ME, 2, 'b')])).toBe(1);
  });

  it('is the last message even with things you did after it, as in their screenshot', () => {
    expect(newestSaid([said(ME, 1, 'a'), said(MAYA, 2, 'b'), act(3), act(4)])).toBe(1);
  });

  it('is not a folded run of work', () => {
    expect(newestSaid([said(MAYA, 1, 'a'), { kind: 'run', at: 2, items: [] }])).toBe(0);
  });

  it('is nothing in a chat with no messages', () => {
    expect(newestSaid([act(1)])).toBe(-1);
    expect(newestSaid([])).toBe(-1);
  });
});

describe('the chat, drawn', () => {
  const draw = (events) => inTeam(React.createElement(Thread, { events, chat: true, name: 'Claude Code', landOn: 'w-1', onWhole: () => {}, md }));

  it('tells only the newest message it is the newest', () => {
    const html = draw([said(MAYA, at(9, 0), 'Findings, part one.'), said(ME, at(9, 30), 'Thanks.'), said(MAYA, at(10, 0), 'Findings, part two.'), act(at(16, 30)), act(at(19, 23))]);
    expect(folds(html)).toEqual([['Findings, part one.', 'older'], ['Thanks.', 'older'], ['Findings, part two.', 'newest']]);
  });

  it('tells a chat of one message that it is the newest', () => {
    expect(folds(draw([said(MAYA, at(9, 0), 'Only this.')]))).toEqual([['Only this.', 'newest']]);
  });
});

describe('a thread in its panel, drawn', () => {
  const draw = (replies) => inTeam(React.createElement(ThreadPanel, {
    product: 'northwind', parent: said(MAYA, at(9, 0), 'The message.', 'u-1'), replies, md, width: 440,
    onSend: () => {}, onClose: () => {}, onResize: () => {},
  }));

  it('tells only the newest reply it is the newest', () => {
    const html = draw([said(ME, at(9, 5), 'First reply.', 'u-2'), said(MAYA, at(9, 6), 'Last reply.', 'u-3')]);
    expect(folds(html)).toEqual([['The message.', 'older'], ['First reply.', 'older'], ['Last reply.', 'newest']]);
  });

  it('tells the message itself it is the newest while nobody has replied', () => {
    expect(folds(draw([]))).toEqual([['The message.', 'newest']]);
  });
});
