// A PROFILE RANKS SOMEONE ONLY IN A GROUP, AND ONLY WITH HOURS (synthetic team round 3, 2026-11-20).
//
// Opened from the panel beside Sam's chat with Theo, Theo's profile said
// "#1 in Sam Ortiz this week": the rank was in the two-person room behind
// that chat, which is named for a person. Lena's said "#1 in Agentbox Team
// this week" and "#1 on Agentbox all time" with 0 agent hours, because
// everyone was at nought. Measured on which ranks the profile draws: a rank
// in a group of three or more, for someone with hours that week; the all-time
// rank only for someone with hours at all.
import { describe, it, expect } from 'vitest';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { profileRanks } from '../renderer/src/team/rooms/room-rules.ts';
import { ProfilePage } from '../renderer/src/team/rooms/RoomPerson.tsx';
import type { Room, RoomCard } from '../renderer/src/types.ts';
globalThis.React = React;

const person = (id: string, o: Partial<RoomCard> = {}): RoomCard => ({
  id, me: false, name: id, avatarUrl: null, headline: null, bio: null, agents: 0, hoursTotal: 3, hoursWeek: 2, hoursToday: 0, streak: 1, byMonth: [],
  teammate: true, showActivity: true, status: null, workingOn: null, workingPrivate: false, ...o,
});
const room = (name: string, wall: RoomCard[], o: Partial<Room> = {}) => ({ id: 'r', name, kind: 'room', members: wall.length, wall, ...o }) as unknown as Room;
const theo = person('theo', { hoursWeek: 2 });
const team = room('Agentbox Team', [theo, person('lena', { hoursWeek: 5 }), person('sam', { hoursWeek: 0 })], { teamId: 't' } as Partial<Room>);

describe('the ranks a profile shows', () => {
  it('this week’s rank in a group, for someone with hours this week', () => {
    expect(profileRanks(team, theo, 3)).toEqual({ week: 2, allTime: 3 });
  });
  it('no rank in the two-person room behind a chat', () => {
    expect(profileRanks(room('Sam Ortiz', [theo, person('sam')]), theo, 3).week).toBeNull();
  });
  it('no week’s rank with no hours this week', () => {
    expect(profileRanks(team, team.wall[2], 3).week).toBeNull();
  });
  it('no all-time rank with no hours at all, or none known', () => {
    expect(profileRanks(team, { ...theo, hoursTotal: 0 }, 1).allTime).toBeNull();
    expect(profileRanks(team, theo, undefined).allTime).toBeNull();
  });
});

describe('the page', () => {
  const html = (r: Room, c: RoomCard, rank?: number) => renderToStaticMarkup(createElement(ProfilePage, { card: c, room: r, rooms: [r], rank, onRanks: () => {} }));
  it('does not name a person as the place someone is ranked', () => {
    expect(html(room('Sam Ortiz', [theo, person('sam')]), theo, 1)).not.toContain('In Sam Ortiz this week');
  });
  it('says no #1 for someone with no hours', () => {
    const lena = person('lena', { hoursTotal: 0, hoursWeek: 0 });
    expect(html(room('Agentbox Team', [lena, person('sam', { hoursTotal: 0, hoursWeek: 0 }), person('theo', { hoursTotal: 0, hoursWeek: 0 })]), lena, 1)).not.toContain('#1');
  });
  it('still ranks someone with hours in their group', () => {
    expect(html(team, theo, 3)).toContain('In Agentbox Team this week');
    expect(html(team, theo, 3)).toContain('#3');
  });
});
