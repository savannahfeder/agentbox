// A THREAD OR A SIDE PANEL LEAVES THE QUICK EMOJI OFF THE BAR (w-59b4e9f32a).
//
// "This tab bar is a little cluttered, especially with all the emojis. It takes
// up a lot of the space in this component ... when we're in a thread or a
// smaller view, [don't] show the emoji previews." Measured on the built app
// signed in to a made-up team: in a room's chat panel, 359px wide, the bar a
// message shows on pointing was 179px, three emoji and three buttons, laid over
// half the message under it.
//
// Where the chat is narrow (a room's side panel) or is a thread (the room's
// thread view, a direct chat's thread panel), the bar keeps React, Reply and
// More and drops the three emoji. React still opens the emoji with your recent
// ones first. A chat at full width keeps them.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoomChat } from '../renderer/src/team/rooms/RoomChat.tsx';
import { quickOnBar } from '../renderer/src/team/rooms/room-chat-rules.ts';
import { ThreadPanel } from '../renderer/src/team/ThreadPanel.tsx';
import { MessageActions } from '../renderer/src/team/ChatActions.tsx';
import { Thread } from '../renderer/src/components/Thread.tsx';
import { TeamContext } from '../renderer/src/team/people.tsx';

const ME = 'p-me', MAYA = 'p-maya';
const T = new Date(2026, 9, 21, 10, 0).getTime();
const m = (id, by, min, body) => ({ id, roomId: 'r1', by, body, inReplyTo: null, mentions: [], at: T + min * 60_000 });
const room = { id: 'r1', name: 'General', kind: 'room', teamId: 't', listed: false, inviteOnly: false, role: 'member', members: 2, createdAt: T - 1e9, pinned: false, muted: false, unread: 0, readAt: T + 9e6, lastAt: T, agents: 0, wall: [] };
const people = [{ id: ME, name: 'Sam Rivera', avatarUrl: null, me: true }, { id: MAYA, name: 'Maya Chen', avatarUrl: null, me: false }];
const calls = { onSend: async () => null, onRead: () => {}, onReact: () => {}, onEdit: async () => null, onDelete: () => {}, onMarkUnread: () => {} };
const messages = [m('a', MAYA, 0, 'The signup fix is up for review.'), m('b', ME, 4, 'Looking now.')];
const roomChat = (full) => renderToStaticMarkup(React.createElement(RoomChat, { room, messages, people, meId: ME, now: T + 3_600_000, full, ...calls }));
const quick = (html) => (html.match(/class="chat-quick"/g) ?? []).length;

const team = {
  state: {}, me: ME,
  byId: new Map([[ME, { id: ME, name: 'Sam Rivera', email: '', avatarUrl: null }], [MAYA, { id: MAYA, name: 'Maya Chen', email: '', avatarUrl: null }]]),
  products: new Map(),
};
const inTeam = (el) => renderToStaticMarkup(React.createElement(TeamContext.Provider, { value: team }, el));
const md = (t) => React.createElement('p', null, t);

describe('a room’s chat beside its people', () => {
  const html = roomChat(false);

  it('draws the bar without the quick emoji', () => {
    expect(html).toContain('class="chat-acts"');
    expect(quick(html)).toBe(0);
  });

  it('keeps React, Reply in thread and More on it', () => {
    expect(html).toContain('aria-label="React"');
    expect(html).toContain('aria-label="Reply in thread"');
    expect(html).toContain('aria-label="More"');
  });
});

describe('a room’s chat at full width on the Messages page', () => {
  it('keeps the three quick emoji on each message’s bar', () => {
    expect(quick(roomChat(true))).toBe(messages.length * 3);
  });
});

describe('which room chats get the quick emoji', () => {
  it('only a full-width chat that is not showing a thread', () => {
    expect(quickOnBar({ full: true, thread: false })).toBe(true);
    expect(quickOnBar({ full: true, thread: true })).toBe(false);
    expect(quickOnBar({ full: false, thread: false })).toBe(false);
    expect(quickOnBar({ full: false, thread: true })).toBe(false);
  });
});

describe('a direct chat’s thread panel', () => {
  const parent = { at: T, who: 'you', by: MAYA, text: 'Two tiers or three?', uid: 'u-ask' };
  const html = inTeam(React.createElement(ThreadPanel, {
    parent, replies: [{ at: T + 60_000, who: 'you', by: ME, text: 'Three.', uid: 'u-r1' }], md, width: 440,
    onReact: () => {}, onSend: () => {}, onClose: () => {}, onResize: () => {},
  }));

  it('draws the bar without the quick emoji, and React is still there', () => {
    expect(html).toContain('class="chat-acts"');
    expect(quick(html)).toBe(0);
    expect(html).toContain('aria-label="React"');
  });
});

describe('what keeps them', () => {
  it('a direct chat itself, at the reading pane’s width', () => {
    const html = inTeam(React.createElement(Thread, {
      events: [{ at: T, who: 'you', by: MAYA, text: 'Sending my findings here.', uid: 'l-one' }], chat: true,
      name: 'Claude Code', landOn: 'w-1', onWhole: () => {}, md, onReact: () => {}, onQuote: () => {},
    }));
    expect(quick(html)).toBe(3);
  });

  it('any bar that is not told otherwise', () => {
    expect(quick(renderToStaticMarkup(React.createElement(MessageActions, { onReact: () => {} })))).toBe(3);
  });
});
