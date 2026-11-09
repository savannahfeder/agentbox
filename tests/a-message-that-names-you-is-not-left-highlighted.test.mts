// A MESSAGE THAT NAMES YOU IS NOT LEFT HIGHLIGHTED.
//
// In a room, every message with your @name sat on a grey band with an orange
// bar down its left edge, for good: it looked stuck, and with other unread
// messages around it nothing said why that one was marked. Measured on the
// drawn chat: no message row carries the band, your own @name is marked
// where it is written instead, someone else's @name is not, and a longer name
// that starts with yours is not taken for you.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoomChat } from '../renderer/src/team/rooms/RoomChat.tsx';
import { mentionMarkdown } from '../renderer/src/team/rooms/room-chat-rules.ts';

const ME = 'p-me', MAYA = 'p-maya', SAMR = 'p-samr';
const T = new Date(2026, 9, 21, 10, 0).getTime();
const m = (id, by, min, body, extra = {}) => ({ id, roomId: 'r1', by, body, inReplyTo: null, mentions: [], at: T + min * 60_000, ...extra });
const room = { id: 'r1', name: 'Northwind', kind: 'room', teamId: 't', listed: false, inviteOnly: false, role: 'member', members: 3, createdAt: T - 1e9, pinned: false, muted: false, unread: 0, readAt: T + 60 * 60_000, lastAt: T, agents: 0, wall: [] };
const people = [{ id: ME, name: 'Sam', avatarUrl: null, me: true }, { id: MAYA, name: 'Maya Chen', avatarUrl: null, me: false }, { id: SAMR, name: 'Sam Rivera', avatarUrl: null, me: false }];
const calls = { onSend: async () => null, onRead: () => {}, onReact: () => {}, onEdit: async () => null, onDelete: () => {}, onMarkUnread: () => {}, onPutFile: async () => null, loadFile: async () => null };
const draw = (messages) => renderToStaticMarkup(React.createElement(RoomChat, { room, messages, people, meId: ME, now: T + 3_600_000, full: true, ...calls }));

const html = draw([
  m('a', MAYA, 0, 'Can @Sam look at the launch post?', { mentions: [ME] }),
  m('b', MAYA, 5, '@Sam Rivera has the captions.', { mentions: [SAMR] }),
  m('c', ME, 9, 'Asking @Maya Chen too.', { mentions: [MAYA] }),
]);

describe('a message that names you', () => {
  it('is drawn on no band, read or not', () => {
    expect(html).not.toMatch(/class="rm-cm[^"]* mine/);
    const css = fs.readFileSync(new URL('../renderer/src/team/rooms/rooms.css', import.meta.url), 'utf8');
    expect(css).not.toMatch(/\.rm-cm\.mine\b/);
  });

  it('marks your own @name where it is written', () => {
    expect(html).toContain('<b class="rm-at me">@Sam</b>');
  });

  it('leaves anyone else’s @name as a plain mention', () => {
    expect(html).toContain('<b class="rm-at">@Maya Chen</b>');
  });

  it('does not take a longer name that starts with yours for you', () => {
    expect(html).toContain('<b class="rm-at">@Sam Rivera</b>');
    expect(mentionMarkdown('@Sam Rivera and @sam', ['Sam', 'Sam Rivera'], ['Sam'])).toBe('[@Sam Rivera](#mention) and [@sam](#mention-me)');
  });
});

describe('a message that names you by your first name', () => {
  const people2 = [{ id: ME, name: 'Sam Rivera', avatarUrl: null, me: true }, { id: MAYA, name: 'Maya Chen', avatarUrl: null, me: false }];
  const draw2 = (messages, who = people2) => renderToStaticMarkup(React.createElement(RoomChat, { room, messages, people: who, meId: ME, now: T + 3_600_000, full: true, ...calls }));

  it('marks it as yours, as it counts as a mention of you', () => {
    expect(draw2([m('a', MAYA, 0, 'can @sam look?', { mentions: [ME] })])).toContain('<b class="rm-at me">@sam</b>');
  });

  it('leaves it alone when someone else in the room shares the first name', () => {
    const who = [...people2, { id: SAMR, name: 'Sam Ortiz', avatarUrl: null, me: false }];
    expect(draw2([m('a', MAYA, 0, 'can @sam look?', { mentions: [] })], who)).not.toContain('rm-at');
  });

  it('does not mark the start of a longer word, first name or full', () => {
    expect(mentionMarkdown('ask @Samantha', ['Sam Rivera'], ['Sam Rivera', 'Sam'])).toBe('ask @Samantha');
    expect(mentionMarkdown('ask @Sam RiveraX', ['Sam Rivera'], ['Sam Rivera', 'Sam'])).toBe('ask @Sam RiveraX');
    expect(mentionMarkdown('thanks @Sam Rivera, done', ['Sam Rivera'], ['Sam Rivera'])).toBe('thanks [@Sam Rivera](#mention-me), done');
  });
});
