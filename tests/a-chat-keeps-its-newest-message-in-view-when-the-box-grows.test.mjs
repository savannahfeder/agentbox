// A CHAT KEEPS ITS NEWEST MESSAGE IN VIEW WHEN THE BOX UNDER IT GROWS.
//
// "If your voice note extends past the size of the box, it will not be
// visible. It just gets cut off at the bottom." A voice note dropped into the
// box makes the box 50px taller, and the message list above it 50px shorter.
// The Chats page's list and the thread side panel only went back to the bottom
// when a message was added, so the newest message was left half under the box.
// Measured in the built app on a made-up team at 1440x900, in a chat long
// enough to scroll: with a note in the box, 46px of the last message was
// hidden; after this change, none.
//
// Both lists now use holdAtBottom (../renderer/src/thread-bottom.ts), the
// stick agent threads already had: it follows the list's own height (the box
// growing) and the height of the one element holding the messages (a message
// arriving or drawing late), for as long as you are at the bottom. Its rules
// are tested in the-thread-opens-at-the-bottom.test.mjs; this pins that both
// lists are built the way it needs and arm it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoomChat } from '../renderer/src/team/rooms/RoomChat.tsx';
import { ThreadPanel } from '../renderer/src/team/ThreadPanel.tsx';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// The opening tags of an element's direct children, found by walking the tags.
function childrenOf(html, opening) {
  const from = html.indexOf(opening);
  expect(from).toBeGreaterThan(-1);
  const tags = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g;
  tags.lastIndex = from + opening.length;
  const VOID = new Set(['img', 'input', 'br', 'hr', 'meta', 'link', 'source']);
  const kids = [];
  let depth = 0;
  for (let m; (m = tags.exec(html));) {
    const [whole, close, name, , self] = m;
    if (close) { if (depth === 0) break; depth -= 1; continue; }
    if (depth === 0) kids.push(whole);
    if (!self && !VOID.has(name.toLowerCase())) depth += 1;
  }
  return kids;
}

const T = new Date(2026, 9, 21, 10, 0).getTime();
const ME = 'p-me', MAYA = 'p-maya';

describe('the Chats page list', () => {
  const room = { id: 'r1', name: 'Northwind', kind: 'room', teamId: 't', listed: false, inviteOnly: false, role: 'member', members: 2, createdAt: T - 1e9, pinned: false, muted: false, unread: 0, readAt: T + 60 * 60_000, lastAt: T, agents: 0, wall: [] };
  const people = [{ id: ME, name: 'Sam', avatarUrl: null, me: true }, { id: MAYA, name: 'Maya Chen', avatarUrl: null, me: false }];
  const m = (id, by, min, body) => ({ id, roomId: 'r1', by, body, inReplyTo: null, mentions: [], at: T + min * 60_000 });
  const calls = { onSend: async () => null, onRead: () => {}, onPutFile: async () => null, loadFile: async () => null };
  const draw = (full) => renderToStaticMarkup(React.createElement(RoomChat, {
    room, people, meId: ME, now: T + 3_600_000, full, ...calls,
    messages: [m('a', MAYA, 0, 'Stripe is wired.'), m('b', ME, 2, 'Nice.'), m('c', MAYA, 4, '[voice-note-3000ms.webm](attachments/voice-note-3000ms.webm)')],
  }));

  for (const full of [true, false]) {
    it(`holds every message in one element, so a message arriving is a change of its height (${full ? 'full page' : 'side chat'})`, () => {
      const html = draw(full);
      const kids = childrenOf(html, '<div class="rm-chat-list">');
      expect(kids).toEqual(['<div class="rm-chat-msgs">']);
      expect(html.match(/class="rm-cm[ "]/g)).toHaveLength(3);
    });
  }

  it('arms the hold on the list, once per conversation and per thread', () => {
    const chat = read('renderer/src/team/rooms/RoomChat.tsx');
    expect(chat).toMatch(/import \{ holdAtBottom \} from '\.\.\/\.\.\/thread-bottom';/);
    expect(chat).toMatch(/useLayoutEffect\(\(\) => holdAtBottom\(ref\.current\), deps\);/);
    expect(chat).toContain('useStick([room.id, thread])');
    expect(chat).not.toMatch(/atBottom/);
  });

  it('the element holding the messages is laid out as the list was', () => {
    const css = read('renderer/src/team/rooms/rooms.css');
    expect(css).toMatch(/\.rm-chat-msgs \{[^}]*display: flex; flex-direction: column;[^}]*\}/);
  });
});

describe('the thread side panel', () => {
  const turn = (uid, who, min, text) => ({ uid, who, at: T + min * 60_000, text });
  const draw = () => renderToStaticMarkup(React.createElement(ThreadPanel, {
    product: 'p', id: 'w-1', parent: turn('u1', 'it', 0, 'Can you look at this?'),
    replies: [turn('u2', 'you', 1, 'Yes.'), turn('u3', 'it', 2, 'Thanks.')],
    md: (text) => text, width: 380, onSend: () => true, onClose: () => {}, onResize: () => {},
  }));

  it('holds every reply in one element', () => {
    const kids = childrenOf(draw(), '<div class="chat-thread-body">');
    expect(kids).toEqual(['<div class="chat-thread-msgs">']);
  });

  it('arms the hold on its body, and still lands on each new reply', () => {
    const panel = read('renderer/src/team/ThreadPanel.tsx');
    expect(panel).toMatch(/import \{ holdAtBottom \} from '\.\.\/thread-bottom';/);
    expect(panel).toMatch(/useBeforePaint\(\(\) => holdAtBottom\(body\.current\), \[parent\.uid, shown\]\);/);
    expect(panel).not.toMatch(/el\.scrollTop = el\.scrollHeight/);
  });

  it('keeps the gap between replies on the element that holds them', () => {
    const css = read('renderer/src/team/chat.css');
    expect(css).toMatch(/\.chat-thread-msgs \{[^}]*display: flex; flex-direction: column; gap: 20px;[^}]*\}/);
    const body = /\.chat-thread-body \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(body).toContain('overflow-y: auto');
    expect(body).not.toContain('gap:');
  });
});
