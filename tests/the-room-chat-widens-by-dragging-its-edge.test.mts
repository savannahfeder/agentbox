// THE ROOM CHAT WIDENS BY DRAGGING ITS EDGE, AND THE ROOM TAB'S LINE FITS ITS NAME
// (w-49cd37092c, 2026-10-23).
//
// Two notes on the room in the Threads tab. "This line is too wide and covers
// the part that is typically invisible": the lit tab's underline ran under the
// picker's arrow, which is hidden until you point at it, so the line went on
// past "8" into nothing. It now sits under the name and count only. And "can
// you make the chat expandable? I should probably be able to drag that line":
// the chat beside a room was a fixed 360px. Its edge drags now, within limits
// that leave the board its three columns, and the width is kept. Measured on
// the built app at 1440 by 900: the lit tab's line was 137px under a name and
// count 115px wide.
//
// Shown the chat dragged to 480: "I actually kind of like the spacing when it's
// more even. We have more of the chat so maybe by default make the spacing
// closer to this." That picture was 1440 wide, where 480 is 41% of the room,
// so the chat starts at 41% of the room on any screen (a fixed 480 left a 1728
// screen's board twice the chat's width), and a double-click goes back there.
//
// The room tab, and the faces over the board, went on 2026-10-23
// (w-dcaa2c122e): with Groups on, the page's name is a menu.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chatWidth, readChatWidth, writeChatWidth, CHAT_SHARE, BOARD_LEAST } from '../renderer/src/team/rooms/room-rules.ts';
import { RoomChat } from '../renderer/src/team/rooms/RoomChat.tsx';
globalThis.React = React;

const css = fs.readFileSync(new URL('../renderer/src/team/rooms/rooms.css', import.meta.url), 'utf8');
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };

describe('how wide the chat may be', () => {
  it('41% of the room until it is dragged, which is the 480 that was liked at 1440', () => {
    expect(readChatWidth(memory())).toBeNull();
    expect(readChatWidth(null)).toBeNull();
    expect(css).toMatch(new RegExp(`\\.rm-chat \\{ width: var\\(--rm-chat-w, ${CHAT_SHARE * 100}%\\);`));
    expect(Math.round(1172 * CHAT_SHARE)).toBe(481);
  });
  it('back to 41% when the width is cleared', () => {
    const store = memory();
    writeChatWidth(540, store);
    writeChatWidth(null, store);
    expect(readChatWidth(store)).toBeNull();
  });
  it('what it was dragged to, kept', () => {
    const store = memory();
    writeChatWidth(540, store);
    expect(readChatWidth(store)).toBe(540);
  });
  it('41% for anything it cannot read', () => {
    const store = memory();
    store.setItem('rooms.chat.width', 'wide');
    expect(readChatWidth(store)).toBeNull();
  });
  // The second number is the room's width, board and chat together: 1140 in a
  // 1440 window with the sidebar open.
  it('never narrower than 300', () => {
    expect(chatWidth(120, 1428)).toBe(300);
    expect(chatWidth(299, 1428)).toBe(300);
    expect(chatWidth(301, 1428)).toBe(301);
  });
  it('never so wide the board loses its three columns', () => {
    expect(chatWidth(2000, 1140)).toBe(1140 - BOARD_LEAST);
    expect(chatWidth(1140 - BOARD_LEAST, 1140)).toBe(1140 - BOARD_LEAST);
    expect(chatWidth(500, 1140)).toBe(500);
  });
  it('the board keeps room for three columns of 170, their gaps and its padding', () => {
    expect(BOARD_LEAST).toBeGreaterThanOrEqual(3 * 170 + 2 * 18 + 24 + 32);
  });
  it('never past 720 on a big screen', () => {
    expect(chatWidth(2000, 2260)).toBe(720);
  });
  it('300 in a room too narrow for both, and the board scrolls', () => {
    expect(chatWidth(2000, 800)).toBe(300);
  });
  it('a window made smaller narrows a chat left wide, and 41% of a big screen stops at 720', () => {
    expect(css).toMatch(/\.rm-chat \{[^}]*min-width: 300px; max-width: min\(720px, calc\(100% - 620px\)\);/);
  });
});

describe('the chat beside a room', () => {
  const room = { id: 'r1', name: 'Astral', kind: 'room', members: 2, wall: [], unread: 0 };
  const html = renderToStaticMarkup(createElement(RoomChat, { room, messages: [], people: [], meId: 'sam', now: 0, onSend: async () => null }));
  it('has an edge to drag', () => {
    expect(html).toMatch(/class="rm-chat-grip" role="separator" aria-orientation="vertical" aria-label="Drag to widen the chat"/);
  });
  it('takes the room’s share until dragged', () => {
    expect(html).toMatch(/class="rm-chat">/);
  });
  it('is as wide as it was left', () => {
    globalThis.localStorage = memory();
    localStorage.setItem('rooms.chat.width', '540');
    try {
      const left = renderToStaticMarkup(createElement(RoomChat, { room, messages: [], people: [], meId: 'sam', now: 0, onSend: async () => null }));
      expect(left).toMatch(/class="rm-chat" style="--rm-chat-w:540px"/);
    } finally { delete globalThis.localStorage; }
  });
  it('a double-click on the edge clears the width', () => {
    const chat = fs.readFileSync(new URL('../renderer/src/team/rooms/RoomChat.tsx', import.meta.url), 'utf8');
    expect(chat).toMatch(/onDoubleClick=\{\(\) => \{ setWidth\(null\); writeChatWidth\(null\); \}\}/);
  });
  it('the edge sits on the chat’s line and shows the drag cursor', () => {
    expect(css).toMatch(/\.rm-chat-grip \{[^}]*cursor: col-resize/);
  });
  it('the full-page chat has no edge to drag', () => {
    const full = renderToStaticMarkup(createElement(RoomChat, { room, messages: [], people: [], meId: 'sam', now: 0, full: true, onSend: async () => null }));
    expect(full).not.toContain('rm-chat-grip');
  });
});
