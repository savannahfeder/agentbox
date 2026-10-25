// MESSAGE ON SOMEONE'S PAGE OPENS THE CHAT (w-88e1e23325, 2026-10-21).
//
// "The message button just doesn't do anything. It's just an empty click." On
// a person's page, Message for someone outside your team made or found your
// chat with them and put it in the panel beside the room, but a person's page
// draws no panel, so nothing changed on screen. Measured on the built app: the
// click made the chat and the page stayed exactly as it was.
//
// Since Groups (w-dcaa2c122e, 2026-10-23) there is no panel beside a group and
// no Messages page: the chat opens in the Groups tab, as every group does, and
// a teammate's opens as their direct record.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProfilePage } from '../renderer/src/team/rooms/RoomPerson.tsx';
import * as rules from '../renderer/src/team/rooms/room-rules.ts';
globalThis.React = React;

const hook = fs.readFileSync(new URL('../renderer/src/team/rooms/useRooms.tsx', import.meta.url), 'utf8');
const message = hook.slice(hook.indexOf('const message = async'), hook.indexOf('// A SEND TRIED AGAIN'));
const card = (id, o = {}) => ({ id, me: false, name: id, avatarUrl: null, headline: null, bio: null, agents: 0, level: 3, hoursTotal: 1, hoursWeek: 1, hoursToday: 0, streak: 1, byMonth: [], teammate: false, showActivity: true, status: null, workingOn: null, workingPrivate: false, ...o });
const page = (c, onMessage) => {
  const room = { id: 'r1', name: 'Northwind', wall: [c] };
  return renderToStaticMarkup(createElement(ProfilePage, { card: c, room, rooms: [room], cards: [], rank: 1, onRanks: () => {}, onMessage }));
};

describe('Message on someone’s page', () => {
  it('is there for someone else, and not on my own page', () => {
    expect(page(card('alex'), () => {})).toContain('Message</button>');
    expect(page(card('sam', { me: true }), () => {})).not.toContain('Message</button>');
  });
  it('opens the chat in the Groups tab, the same chat each time for the same people', () => {
    expect(message).toMatch(/const group = all\.find\(\(r\) => r\.kind === 'group'/);
    expect(message).toMatch(/openRoom\(id\);\s*\};\s*$/);
  });
  it('opens a teammate’s direct record instead', () => {
    expect(message).toContain('if (people.every((id) => cards.get(id)?.teammate)) { onTeamMessage(people); return; }');
  });
  it('never puts the chat beside a group, or on a Messages page', () => {
    expect(message).not.toMatch(/setPanelId|setFull|setCameFrom/);
    expect(rules.whereChatOpens).toBeUndefined();
  });
});
