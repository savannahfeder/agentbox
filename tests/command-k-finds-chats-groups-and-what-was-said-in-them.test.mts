// COMMAND K FINDS CHATS AND GROUPS BY NAME.
//
// The owner, 2026-10-30: "in chats, we have this little G thing for finding a
// group. It's logical for that to also be searchable via Command K, just like
// threads are." Command K found threads and teammates' shared threads only; a
// group, a chat with a person or an AI teammate could only be found by scrolling
// the Chats page. What was said inside them is found with every other line
// (tests/search-rows-say-who-wrote-it-where-and-open-at-the-message).
import { describe, it, expect } from 'vitest';
import { chatsFound } from '../renderer/src/team/chats-found';

const groups = [
  { key: 'room:r1', name: 'Lumen', faces: [], last: '', at: 1, unread: false, pinned: true, team: true },
  { key: 'room:r2', name: 'Sofia, Dev', faces: [{ name: 'Sofia', url: null }, { name: 'Dev', url: null }], last: '', at: 2, unread: false, pinned: false },
  { key: 'room:r3', name: 'Coworking', faces: [], last: '', at: 3, unread: false, pinned: false },
];
const teammates = [
  { id: 't-aaa111', name: 'Chief of staff', role: 'Chief of staff', job: 'Keeps the week moving and writes the Friday status.' },
  { id: 't-bbb222', name: 'Support lead', role: null, job: 'Drafts replies to clinics.' },
];
const find = (query) => chatsFound({ groups, teammates, query });

describe('command K finds chats', () => {
  it('finds a group by its name', () => {
    const got = find('lumen');
    expect(got.find((r) => r.kind === 'group')).toMatchObject({ key: 'room:r1', label: 'Lumen' });
  });

  it('finds a chat by a person in it', () => {
    expect(find('sofia').some((r) => r.kind === 'group' && r.key === 'room:r2')).toBe(true);
  });

  it('finds an AI teammate by its name or its job', () => {
    expect(find('chief').find((r) => r.kind === 'teammate')).toMatchObject({ key: 't-aaa111', label: 'Chief of staff' });
    expect(find('clinics').some((r) => r.kind === 'teammate' && r.key === 't-bbb222')).toBe(true);
  });

  it('finds nothing for nothing typed, and nothing that is not there', () => {
    expect(find('')).toEqual([]);
    expect(find('zzzz')).toEqual([]);
  });
});
