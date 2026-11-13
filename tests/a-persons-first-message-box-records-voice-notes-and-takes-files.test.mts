// A PERSON'S FIRST MESSAGE BOX RECORDS VOICE NOTES AND TAKES FILES (2026-11-12).
//
// The founder, on a teammate's page in Team: "bunch of features disappeared
// from chats with teammates, like audio messages etc." Since pressing a person
// always opens their page (a0f35132), someone you had only written to the old
// way (their talk sits behind "Earlier messages") lands on "Send Margarette
// your first message", and that box was a bare textarea with a Send: no
// microphone, no paperclip, no formatting, no @names. Measured on the drawn
// box: none of "Record a voice note", "Attach a file" or "Formatting" was in
// it. Now it is the chat's own box, and the first thing it sends makes the
// chat, once, even when a file goes up before the words.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React, { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FirstChatBox } from '../renderer/src/team/rooms/RoomChat.tsx';
import { madeOnce } from '../renderer/src/team/rooms/room-chat-rules.ts';
globalThis.React = React;

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const box = (o = {}) => renderToStaticMarkup(h(FirstChatBox, {
  person: { id: 'p-m', name: 'Margarette Pineda', avatarUrl: null, me: false }, placeholder: 'Message Margarette',
  open: async () => 'r-1', send: async () => null, putFile: async () => null, putFileFrom: async () => null, ...o,
}));

describe('the box before the first message', () => {
  const html = box();
  it('records a voice note', () => expect(html).toContain('aria-label="Record a voice note"'));
  it('attaches a file', () => expect(html).toContain('aria-label="Attach a file"'));
  it('has the formatting row and @names', () => {
    expect(html).toContain('aria-label="Formatting"');
    expect(html).toContain('aria-label="Mention someone"');
  });
  it('sends with the chat’s own button', () => {
    expect(html).toMatch(/<div class="rm-compose">/);
    expect(html).toMatch(/class="dock-send"/);
  });
});

describe('making the chat on the first send', () => {
  it('makes it once when a file and then the words go', async () => {
    let made = 0;
    const room = madeOnce(async () => { made += 1; return `r-${made}`; });
    expect(await room()).toBe('r-1');
    expect(await room()).toBe('r-1');
    expect(made).toBe(1);
  });
  it('makes it once when two sends start in the same moment', async () => {
    let made = 0;
    const room = madeOnce(async () => { made += 1; await new Promise((r) => setTimeout(r, 5)); return 'r-1'; });
    expect(await Promise.all([room(), room()])).toEqual(['r-1', 'r-1']);
    expect(made).toBe(1);
  });
  it('tries again after a try that failed, rather than failing for good', async () => {
    let tries = 0;
    const room = madeOnce(async () => { tries += 1; if (tries === 1) throw new Error('offline'); return 'r-1'; });
    await expect(room()).rejects.toThrow('offline');
    expect(await room()).toBe('r-1');
    expect(tries).toBe(2);
  });
});

describe("a person's page", () => {
  const at = app.indexOf('placeEl = <MemberPlace m={placeMember} waits={placeWaits} onBack={back}');
  const place = app.slice(app.lastIndexOf('const room = personChats', at), app.indexOf('side={', at));
  it('draws the chat’s own box for the first message, not the bare one', () => {
    expect(place).toMatch(/chatShows === 'first message'\s*\?\s*<ChatStart[^]*?roomsUi\.firstChat\(/);
  });
});
