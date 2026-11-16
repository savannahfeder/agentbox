// A PHONE CHAT CAN REPORT A MESSAGE, BLOCK A PERSON, AND HIDES BAD WORDS.
//
// What was missing (2026-11-15, w-47416cec15): the App Store build left chats
// out entirely, because App Review guideline 1.2 asks an app where people
// message each other to let them report a message, block a person and filter
// what is posted, and the phone's chats had none of the three
// (tests/the-app-store-build-leaves-out-group-chat-and-alpha-features). So the
// iPhone app people install could not chat with a teammate at all. These are
// the rules the chat screen draws by, measured on made-up messages.
import { describe, it, expect } from 'vitest';
import { blockedFrom, cleanWords, reportAboutMessage, roomsShown, shownMessages, withBlocked, withoutBlocked } from '../mobile/src/lib/chat-safety';
import { reportText } from '../mobile/src/lib/report';
import type { Room, RoomMessage } from '../renderer/src/types';

const ME = 'me';
const SAM = 'sam';
const KAI = 'kai';
const m = (id: string, by: string, body = `said ${id}`, extra: Partial<RoomMessage> = {}): RoomMessage => ({ id, roomId: 'r-1', by, body, inReplyTo: null, mentions: [], at: Number(id.slice(1)), ...extra });
const room = (id: string, kind: Room['kind'], people: string[]) => ({ id, kind, teamId: kind === 'room' ? 't-1' : null, members: people.length, people: people.map((p) => ({ id: p, name: p, avatarUrl: null })), wall: [] }) as unknown as Room;

describe('blocking a person', () => {
  it('hides their messages, and nobody else’s', () => {
    const list = [m('m1', SAM), m('m2', KAI), m('m3', SAM), m('m4', ME)];
    expect(shownMessages(list, { blocked: new Set([SAM]), reported: new Set() }).map((x) => x.id)).toEqual(['m2', 'm4']);
  });

  it('hides a chat with only them in it, but not a group they are one of', () => {
    const rooms = [room('team', 'room', [ME, SAM, KAI]), room('pair', 'group', [ME, SAM]), room('three', 'group', [ME, SAM, KAI])];
    expect(roomsShown(rooms, new Set([SAM]), ME).map((r) => r.id)).toEqual(['team', 'three']);
  });

  it('is kept as a list that survives a restart, without doubles, and can be undone', () => {
    const once = withBlocked('[]', SAM);
    expect(blockedFrom(withBlocked(once, SAM))).toEqual(new Set([SAM]));
    expect(blockedFrom(withoutBlocked(once, SAM))).toEqual(new Set());
    expect(blockedFrom('not json')).toEqual(new Set());
    expect(blockedFrom(null)).toEqual(new Set());
  });

  it('never hides your own messages, even if your own id were on the list', () => {
    expect(shownMessages([m('m1', ME)], { blocked: new Set([ME]), reported: new Set(), me: ME }).map((x) => x.id)).toEqual(['m1']);
  });
});

describe('reporting a message', () => {
  it('hides it from you at once', () => {
    expect(shownMessages([m('m1', SAM), m('m2', SAM)], { blocked: new Set(), reported: new Set(['m1']) }).map((x) => x.id)).toEqual(['m2']);
  });

  it('says which message, which chat and who wrote it, with their words and yours', () => {
    const about = reportAboutMessage({ message: m('m7', SAM, 'the words'), roomName: 'Northwind', byName: 'Sam R.' });
    expect(about).toEqual({ kind: 'message', ref: 'r-1/m7', title: 'A message from Sam R. (sam) in Northwind', answer: 'the words' });
    expect(reportText(about, 'It is abusive.')).toBe('Report about a chat message r-1/m7 ("A message from Sam R. (sam) in Northwind")\n\nIt is abusive.\n\nThe message reported:\nthe words');
  });

  it('a thread’s report reads as it did', () => {
    expect(reportText({ ref: 'p/w-1', title: 'T', answer: 'A' }, 'why')).toBe('Report about thread p/w-1 ("T")\n\nwhy\n\nThe answer reported:\nA');
  });
});

describe('the word filter', () => {
  const swears = (t: string) => [...t.matchAll(/\bdarn\b/gi)].map((x) => ({ start: x.index!, end: x.index! + x[0].length }));

  it('covers each word it finds with the same number of stars', () => {
    expect(cleanWords('well darn it, Darn', swears)).toBe('well **** it, ****');
  });

  it('leaves words it does not find as they are', () => {
    expect(cleanWords('assess the class', swears)).toBe('assess the class');
    expect(cleanWords('', swears)).toBe('');
  });
});
