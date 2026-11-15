// A PERSON'S MESSAGES FROM BEFORE CHAT ROOMS STILL OPEN FROM TEAM (2026-11-02).
//
// Messages with teammates seemed to have disappeared: Team > People > a
// teammate read "Send <name> your first message" over an empty chat, though
// the conversation with them was still in the store as a direct record (a row
// in a `direct-*` project). Since Team became the one layout,
// pressing a person opens their page, and that page only looked for a chat
// room with them; Team's list hides a one-to-one chat as a group because the
// person is listed instead. So a direct conversation was drawn nowhere.
// Pressing a person now opens it when it is newer than any chat room with them.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { personChatOpens } from '../renderer/src/team/everything/place.ts';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');

describe('which conversation a person opens', () => {
  it('is the direct one when there is no chat room with them', () => {
    expect(personChatOpens({ at: 100 }, null)).toBe('direct');
  });

  it('is the chat room when there is no direct one', () => {
    expect(personChatOpens(null, { at: 100 })).toBe('room');
  });

  it('is whichever was written in last when there are both', () => {
    expect(personChatOpens({ at: 200 }, { at: 100 })).toBe('direct');
    expect(personChatOpens({ at: 100 }, { at: 200 })).toBe('room');
  });

  it('is their page, with nothing to open, when there is neither', () => {
    expect(personChatOpens(null, null)).toBe(null);
  });
});

describe('pressing a person in Team', () => {
  it('opens their direct conversation beside the list when that is the one to open', () => {
    expect(app).toMatch(/const direct = personDirect\(key\.slice\('person:'\.length\)\);\s*if \(direct\) \{ setChatsPlace\(null\); setChatsDirect\(direct\.id\); setFocused\(direct\.item\); markSeen\(direct\.item\); return; \}/);
  });

  it('lights the person in the list while their direct conversation is open', () => {
    expect(app).toMatch(/<ChatsFrame current=\{inChats \? chatsDirectKey\(focused\.id\) : null\}>/);
    expect(app).toMatch(/const chatsDirectKey = \(id: string\) => \{ const one = directs\.find\(\(d\) => d\.id === id && d\.people\.length === 1\); return homeLayout === 'chats' && one \? `person:\$\{one\.people\[0\]\}` : `direct:\$\{id\}`; \};/);
  });
});
