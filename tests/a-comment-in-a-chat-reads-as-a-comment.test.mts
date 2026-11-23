// A COMMENT ON A FILE READS AS A COMMENT IN THE CHAT, THE WAY SLACK SHOWS ONE.
//
// What broke, 2026-11-21 and again 2026-11-22: the founder commented "nah" on a
// line of Priya's sign-up screens and "good stuff" on the whole file. The chat
// first drew a monospace "Note on sign-up-screens.md, …" chip that pushed the
// face down and left "good stuff" with no file at all; the next try drew a
// bordered file card over each comment, of which she said "These don't really
// look like comments to me." Measured by drawing the conversation: nothing on
// either said "commented", and the second comment sat under the first one's head.
//
// Now each comment opens its own head, "You commented on sign-up-screens.md",
// with the words it is about quoted as the notes beside the file quote them.
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chatLayout } from '../renderer/src/team/chat-layout.ts';
import { commentWords } from '../renderer/src/threads/message-kind.ts';
import { Thread } from '../renderer/src/components/Thread.tsx';
import { TeamContext } from '../renderer/src/team/people.tsx';

const NOW = new Date(2026, 10, 22, 15, 0).getTime();
const at = (m) => new Date(2026, 10, 22, 14, m).getTime();
const ME = 'p-jamie', PRIYA = 'p-priya';
const note = (by, m, text, fileMark) => ({ at: at(m), who: 'you', by, text, fileMark: { kind: 'note', file: 'sign-up-screens.md', ...fileMark } });
const said = (by, m, text) => ({ at: at(m), who: 'you', by, text });

describe('what a comment says it is', () => {
  it('names the file it was made on and the words it is about', () => {
    expect(commentWords({ kind: 'note', file: 'sign-up-screens.md', place: '“Pick the Google Drive”' }))
      .toEqual({ verb: 'commented on', file: 'sign-up-screens.md', where: null, quote: '“Pick the Google Drive”' });
  });
  it('a pin or a moment is a place, not a quote', () => {
    expect(commentWords({ kind: 'note', file: 'pick-a-time.png', place: 'Pin 2' })).toMatchObject({ where: 'Pin 2', quote: null });
  });
  it('the whole file has neither', () => {
    expect(commentWords({ kind: 'note', file: 'sign-up-screens.md', place: 'Whole file' })).toMatchObject({ where: null, quote: null });
  });
  it('a reply says it replied, on the version people know it by', () => {
    expect(commentWords({ kind: 'note', file: 'sign-up-screens.md', shown: 'sign-up-screens.md, v1', reply: true })).toMatchObject({ verb: 'replied on', file: 'sign-up-screens.md, v1' });
  });
  it('is nothing for what is not a comment, or one with no file', () => {
    expect(commentWords({ kind: 'approved', file: 'a.png' })).toBe(null);
    expect(commentWords({ kind: 'note', file: '' })).toBe(null);
    expect(commentWords(undefined)).toBe(null);
  });
});

describe('the chat layout around comments', () => {
  it('opens every comment with its own head, the second of two in a row included', () => {
    const slots = chatLayout([note(ME, 1, 'nah', {}), note(ME, 2, 'good stuff', {})], NOW);
    expect(slots.map((s) => s.head)).toEqual([true, true]);
  });
  it('gives the message after a comment its own head, so it does not read as part of it', () => {
    const slots = chatLayout([note(ME, 1, 'nah', {}), said(ME, 2, 'Also, can we talk at 3?')], NOW);
    expect(slots.map((s) => s.head)).toEqual([true, true]);
  });
  it('still runs two plain messages together', () => {
    expect(chatLayout([said(ME, 1, 'a'), said(ME, 2, 'b')], NOW).map((s) => s.head)).toEqual([true, false]);
  });
});

const team = {
  state: {}, me: ME,
  byId: new Map([[ME, { id: ME, name: 'Jamie Park', email: '', avatarUrl: null }], [PRIYA, { id: PRIYA, name: 'Priya Raman', email: '', avatarUrl: null }]]),
  products: new Map(),
};
const draw = (events, chat) => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(NOW);
  try {
    return renderToStaticMarkup(React.createElement(TeamContext.Provider, { value: team },
      React.createElement(Thread, { events, chat, name: 'Claude Code', landOn: 'w-1', onWhole: () => {}, md: (t) => React.createElement('p', null, t) })));
  } finally { clock.mockRestore(); }
};

describe.each([['a chat', true], ['an agent thread', false]])('drawn in %s', (_kind, chat) => {
  const html = draw([
    note(ME, 1, 'nah', { place: '“Pick the Google Drive they should land in.”' }),
    note(ME, 2, 'good stuff', { place: 'Whole file' }),
  ], chat);
  it('says each one is a comment on the file, in its head', () => {
    expect(html.match(/commented on/g)?.length).toBe(2);
    expect(html.match(/class="comment-on-file"[^>]*>sign-up-screens\.md</g)?.length).toBe(2);
  });
  it('quotes the words a comment is about, and only where it has them', () => {
    expect(html.match(/class="comment-quote"/g)?.length).toBe(1);
    expect(html).toContain('“Pick the Google Drive they should land in.”');
  });
  it('draws no box around it and no label chip', () => {
    expect(html).not.toContain('note-on');
    expect(html).not.toMatch(/msg-kind[^"]*">Note on/);
  });
});
