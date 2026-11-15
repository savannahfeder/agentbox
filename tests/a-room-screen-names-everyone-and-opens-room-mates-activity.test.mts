// A ROOM'S SCREEN NAMES EVERYONE AND OPENS A ROOM-MATE'S ACTIVITY (w-3d0fa23ffb, 2026-10-22).
//
// The screen half of what the hour with a test account found. The chat named
// a message's author only off the wall, so anyone off it (invisible, or not on
// Rooms yet) wrote as "Someone". A person's Activity tab opened only for a
// teammate, so the founder saw "Progress" and "Agent hours since October" and
// no activity for a room-mate outside the team. And that chart said "since
// August" under an axis that began at July.
import { describe, it, expect } from 'vitest';
import { activityCards, activityShown, boardPeople, chartNamed, chatPeople, isPresenceCard, roomMateCards } from '../renderer/src/team/rooms/room-rules.ts';

const card = (id, extra = {}) => ({ id, me: false, name: id, avatarUrl: null, teammate: false, showActivity: true, activity: null, ...extra });

describe("the chat's people", () => {
  const wall = [card('ana', { name: 'Ana L.' })];
  it('everyone in the room by name when the cloud says, invisible or not on Rooms yet', () => {
    const people = chatPeople({ wall, people: [{ id: 'ana', name: 'Ana L.', avatarUrl: null }, { id: 'maya', name: 'Maya C.', avatarUrl: null }] }, 'ana');
    expect(people).toEqual([{ id: 'ana', name: 'Ana L.', avatarUrl: null, me: true }, { id: 'maya', name: 'Maya C.', avatarUrl: null, me: false }]);
  });
  it('the wall on a cloud that cannot say', () => {
    expect(chatPeople({ wall, people: null }, 'me')).toEqual([{ id: 'ana', name: 'Ana L.', avatarUrl: null, me: false }]);
  });
});

describe('whose Activity tab opens', () => {
  it('a room-mate outside my team who shows it to their rooms', () => {
    expect(activityShown(card('maya', { activity: [] }))).toBe(true);
  });
  it('not one who keeps it from people outside their team', () => {
    expect(activityShown(card('maya', { activity: null }))).toBe(false);
  });
  it("a teammate's as before, off the team's cards", () => {
    expect(activityShown(card('teo', { teammate: true }))).toBe(true);
    expect(activityShown(card('teo', { teammate: true, showActivity: false }))).toBe(false);
  });
  // Since 2026-10-22 the room is its board, and it shows room-mates' presence lines too
  // (tests/a-room-board-shows-everyone-in-the-room).
  it("the room's board holds whoever's Activity I may open", () => {
    expect(boardPeople([card('maya', { activity: [] }), card('teo', { teammate: true }), card('me', { me: true })]).map((c) => c.id)).toEqual(['maya', 'teo', 'me']);
  });
});

describe("a room-mate's activity lines", () => {
  const activity = [{ title: 'Pick a font for the receipts', project: 'Web', state: 'waiting', at: 5 }, { title: 'Make the checkout faster', project: 'Web', state: 'running', at: 9 }];
  it('become the rows of their Activity tab', () => {
    const rows = activityCards(card('maya', { activity }), []);
    expect(rows.map((r) => [r.state, r.title, r.project, r.updatedAt])).toEqual([['waiting', 'Pick a font for the receipts', 'Web', 5], ['running', 'Make the checkout faster', 'Web', 9]]);
    expect(new Set(rows.map((r) => r.threadId)).size).toBe(2);
  });
  it("a teammate's come off the team's cards, never their presence", () => {
    const team = [{ personId: 'teo', threadId: 't1', title: 'From the team', state: 'running', updatedAt: 1 }];
    expect(activityCards(card('teo', { teammate: true, activity }), team).map((r) => r.title)).toEqual(['From the team']);
  });
  it('reach the board their page draws, once a person, and are known as lines with nothing to open', () => {
    const maya = card('maya', { activity });
    const cards = roomMateCards([{ wall: [maya, card('teo', { teammate: true, activity })] }, { wall: [maya] }]);
    expect(cards.map((c) => [c.personId, c.title])).toEqual([['maya', 'Pick a font for the receipts'], ['maya', 'Make the checkout faster']]);
    expect(cards.every(isPresenceCard)).toBe(true);
    expect(isPresenceCard({ threadId: 'w-1a2b3c4d5e' })).toBe(false);
  });
});

describe('the hours chart', () => {
  const byMonth = [{ month: '2026-07', hours: 0 }, { month: '2026-08', hours: 900 }, { month: '2026-09', hours: 300 }];
  it('leaves the month before the first hours unnamed, so "since August" is not over July', () => {
    expect(chartNamed(['2026-07', '2026-08', '2026-09'], byMonth)).toEqual([false, true, true]);
  });
  it('names every month when the first one drawn already had hours', () => {
    expect(chartNamed(['2026-08', '2026-09'], byMonth)).toEqual([true, true]);
  });
  it('names them all when there are no hours yet', () => {
    expect(chartNamed(['2026-09', '2026-10'], [])).toEqual([true, true]);
  });
});
