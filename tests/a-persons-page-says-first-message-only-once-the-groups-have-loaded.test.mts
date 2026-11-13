// A PERSON'S PAGE SAYS "FIRST MESSAGE" ONLY ONCE THE GROUPS HAVE LOADED (2026-11-11).
//
// A synthetic tester on a three-person team, after the app restarted: "Theo
// conversation now says first message despite prior history", and "Direct
// message disappears after Sending". The person's page drew "Send Theo your
// first message" whenever Rooms was live and no two-person group with Theo was
// in hand, and main starts with no groups (`ready: false`) until the first read
// lands, or keeps none when that read fails (`error` set, `ready` still false).
// Its box then created a new two-person group (useRooms `startChat` finds the
// old one only among the groups already read), so a message sent there went
// into a second chat. Now the page waits, as the group pages do before their
// first read (RoomsPage: "none" would be the one thing not true), and only a
// read that found no group says first message.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { personChatShows } from '../renderer/src/team/one-conversation.ts';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');

describe("what a person's page draws where the chat goes", () => {
  it('their chat once it is read', () => {
    expect(personChatShows({ roomsLive: true, ready: true, room: true })).toBe('chat');
  });
  it('nothing yet while the groups have not been read', () => {
    expect(personChatShows({ roomsLive: true, ready: false, room: false })).toBe('not yet');
  });
  it('nothing yet when the read failed, which leaves the groups unread', () => {
    // A failed read sets `error` and leaves `ready` false (main/team/rooms.mts).
    expect(personChatShows({ roomsLive: true, ready: false, room: false })).toBe('not yet');
  });
  it('first message for someone with truly no conversation', () => {
    expect(personChatShows({ roomsLive: true, ready: true, room: false })).toBe('first message');
  });
  it('the old way to write with Rooms off', () => {
    expect(personChatShows({ roomsLive: false, ready: false, room: false })).toBe('off');
    expect(personChatShows({ roomsLive: false, ready: true, room: false })).toBe('off');
  });
});

describe('App.tsx', () => {
  const at = app.indexOf('placeEl = <MemberPlace m={placeMember} waits={placeWaits} onBack={back}');
  const place = app.slice(app.lastIndexOf('const room = personChats', at), app.indexOf('side={', at));
  it('asks the rule with whether the groups have been read', () => {
    expect(place).toMatch(/personChatShows\(\{ roomsLive: roomsUi\.live, ready: !!snap\.team\?\.rooms\?\.ready, room: !!room \}\)/);
  });
  it('draws the first-message box only when the rule says so, and nothing while it waits', () => {
    expect(place).toMatch(/chatShows === 'not yet' \? null/);
    expect(place).toMatch(/chatShows === 'first message'\s*\?\s*<ChatStart empty=\{<EmptyChat/);
  });
});
