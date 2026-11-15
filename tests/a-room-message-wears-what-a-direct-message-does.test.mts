// A ROOM MESSAGE WEARS WHAT A DIRECT MESSAGE DOES.
//
// A room's chat drew a message as a name, a time and its words, and nothing
// else: no reactions, no way to edit, delete, copy or mark it unread, and no
// voice notes. It now wears the same chips and the same bar as a message in a
// direct chat. Measured on the drawn chat: chips with their counts, the edited
// mark, a deleted message kept only as a line while a reply hangs off it, a
// voice note drawn as a player at its length, an @name as a mention, the New
// line above the first message someone else wrote after your read point, and
// no bar on a deleted message. And in the list of conversations: a
// conversation you marked unread keeps its dot even while it is open, and
// its menu offers only what that kind of conversation can do.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoomChat } from '../renderer/src/team/rooms/RoomChat.tsx';
import { MessagesPage, conversationMenu } from '../renderer/src/team/rooms/MessagesPage.tsx';
import { directConversations } from '../renderer/src/team/rooms/conversations.ts';

const ME = 'p-me', MAYA = 'p-maya', JUN = 'p-jun';
const T = new Date(2026, 9, 21, 10, 0).getTime();
const m = (id, by, min, body, extra = {}) => ({ id, roomId: 'r1', by, body, inReplyTo: null, mentions: [], at: T + min * 60_000, ...extra });
const room = { id: 'r1', name: 'Northwind', kind: 'room', teamId: 't', listed: false, inviteOnly: false, role: 'member', members: 3, createdAt: T - 1e9, pinned: false, muted: false, unread: 2, readAt: T + 15 * 60_000, lastAt: T, agents: 0, wall: [] };
const people = [{ id: ME, name: 'Sam Rivera', avatarUrl: null, me: true }, { id: MAYA, name: 'Maya Chen', avatarUrl: null, me: false }, { id: JUN, name: 'Jun Ito', avatarUrl: null, me: false }];
const calls = { onSend: async () => null, onRead: () => {}, onReact: () => {}, onEdit: async () => null, onDelete: () => {}, onMarkUnread: () => {}, onPutFile: async () => null, loadFile: async () => null };
const draw = (messages) => renderToStaticMarkup(React.createElement(RoomChat, { room, messages, people, meId: ME, now: T + 3_600_000, full: true, ...calls }));

const messages = [
  m('a', MAYA, 0, 'Launch is Thursday. @Sam Rivera can you look?', { mentions: [ME], reactions: { '👍': [ME, JUN] } }),
  m('b', ME, 10, 'Yes, this afternoon.', { editedAt: T + 11 * 60_000 }),
  m('c', JUN, 12, '', { deleted: true }),
  m('d', MAYA, 13, 'reply to the deleted one', { inReplyTo: 'c' }),
  m('e', JUN, 14, '', { deleted: true }),
  m('f', JUN, 20, '[voice-note-41200ms.webm](attachments/lq-x1-voice-note-41200ms.webm)'),
];

describe('a message in a room', () => {
  const html = draw(messages);

  it('wears its reactions with how many people are on them, yours brighter', () => {
    expect(html).toMatch(/class="chat-chip mine"[^>]*>.*?👍.*?chat-chip-count">2</);
  });

  it('says when it was edited', () => {
    expect(html).toContain('class="rm-edited">edited<');
  });

  it('keeps a deleted message only as a line, and only while a reply hangs off it', () => {
    expect(html.match(/This message was deleted\./g)).toHaveLength(1);
  });

  it('draws a voice note as a player at its length', () => {
    expect(html).toContain('aria-label="Play voice note"');
    expect(html).toContain('>0:41<');
    expect(html).not.toContain('voice-note-41200ms.webm</a>');
  });

  it('marks an @name as a mention', () => {
    expect(html).toContain('<b class="rm-at me">@Sam Rivera</b>');
  });

  it('draws the New line above the first message someone else wrote after your read point', () => {
    const at = html.indexOf('class="rm-new"');
    expect(at).toBeGreaterThan(html.indexOf('this afternoon'));
    expect(at).toBeLessThan(html.indexOf('Play voice note'));
  });

  it('gives a deleted message no bar to act on it', () => {
    const bars = html.match(/class="chat-acts/g) ?? [];
    expect(bars).toHaveLength(3);
  });
});

describe('the list of conversations', () => {
  const list = (conversations, onKey) => renderToStaticMarkup(React.createElement(MessagesPage, { list: conversations, onKey, now: T, onPick: () => {}, onAction: () => {} }, null));
  const conv = (extra) => ({ key: 'direct:w-1', kind: 'direct', id: 'w-1', name: 'Maya C.', faces: [], last: 'hi', at: T, unread: true, ...extra });

  it('keeps the dot on the open conversation when you marked it unread', () => {
    expect(list([conv({ marked: true })], 'direct:w-1')).toContain('rm-unread');
  });

  it('drops the dot on the open conversation when it is only waiting on you', () => {
    expect(list([conv({ marked: false })], 'direct:w-1')).not.toContain('class="rm-unread"');
  });

  it('offers mark read or unread and a pin on every conversation, mute on rooms and groups, and leave on a group only', () => {
    expect(conversationMenu(conv({ unread: true })).map((r) => r.label)).toEqual(['Mark as read', 'Pin to top']);
    expect(conversationMenu(conv({ kind: 'room', unread: false })).map((r) => r.label)).toEqual(['Mark as unread', 'Pin to top', 'Mute']);
    expect(conversationMenu(conv({ kind: 'group', unread: false, muted: true })).map((r) => r.label)).toEqual(['Mark as unread', 'Pin to top', 'Unmute', 'Leave conversation']);
  });

  it('counts a direct conversation you marked unread as unread until you open it', () => {
    const products = [{ slug: 'd', name: 'D', team: { direct: true } }];
    const item = { id: 'w-1', product: 'd', title: 'hi', updatedAt: T, people: [ME, MAYA], createdBy: MAYA };
    const [c] = directConversations({ items: [item], products, me: ME, people: new Map(), waiting: new Set(), marked: new Set(['w-1']) });
    expect(c).toMatchObject({ unread: true, marked: true });
    const [d] = directConversations({ items: [item], products, me: ME, people: new Map(), waiting: new Set() });
    expect(d).toMatchObject({ unread: false, marked: false });
  });
});
