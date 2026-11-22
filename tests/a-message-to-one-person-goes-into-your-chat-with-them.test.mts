// A MESSAGE TO ONE PERSON GOES INTO YOUR CHAT WITH THEM (2026-11-11).
//
// Two synthetic testers on one team, each within ten minutes, ended up with two
// conversations with the other. The person's box on the Team page wrote into
// the Rooms chat for the pair; the New thread card with a person picked, and
// Share > Send to a teammate, wrote into the older direct record. One tester:
// "New Inbox Theo conversation starts at 4:23 and lacks our 4:16/4:19
// exchange. I repeated my answer because I do not know which place he reads."
// With Rooms live, a plain message to exactly one person now goes into the
// Rooms chat, files and all. A task, a message to several people, and one the
// chat cannot carry (a picked level, a subject, a link to a thread) go where
// they went before, and with Rooms off nothing changes.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { whereAMessageGoes } from '../renderer/src/team/one-conversation.ts';
import { withFileLinks } from '../renderer/src/team/rooms/room-chat-rules.ts';

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const app = read('renderer/src/App.tsx');
const composer = read('renderer/src/threads/ThreadComposer.tsx');
const rooms = read('renderer/src/team/rooms/useRooms.tsx');

const plain = { asTask: false, people: 1, chat: true, level: undefined, subject: '', threadLinks: false };

describe('where a message from the New thread card goes', () => {
  it('into the chat, with Rooms live, for a plain message to one person', () => {
    expect(whereAMessageGoes(plain)).toBe('chat');
  });

  it('stays a task when it is sent as a task', () => {
    expect(whereAMessageGoes({ ...plain, asTask: true })).toBe('task');
    expect(whereAMessageGoes({ ...plain, asTask: true, chat: false })).toBe('task');
  });

  it('keeps going to the direct record with Rooms off', () => {
    expect(whereAMessageGoes({ ...plain, chat: false })).toBe('direct');
  });

  it('keeps going to the direct record for several people', () => {
    expect(whereAMessageGoes({ ...plain, people: 2 })).toBe('direct');
  });

  it('keeps going to the direct record for what a chat cannot carry', () => {
    expect(whereAMessageGoes({ ...plain, level: 3 })).toBe('direct');
    expect(whereAMessageGoes({ ...plain, subject: 'Checkout' })).toBe('direct');
    expect(whereAMessageGoes({ ...plain, threadLinks: true })).toBe('direct');
  });

  it('counts a level of 0 as picked, since only an unpicked level is left out', () => {
    expect(whereAMessageGoes({ ...plain, level: 0 })).toBe('direct');
  });
});

describe('the files that go with it', () => {
  it('are links under the words, a picture drawn as one', () => {
    expect(withFileLinks('See these', [{ name: 'notes.md', stored: 'k1-a-notes.md' }, { name: 'shot.png', stored: 'k1-b-shot.png' }]))
      .toBe('See these\n\n[notes.md](attachments/k1-a-notes.md)\n![shot.png](attachments/k1-b-shot.png)');
  });

  it('stand alone with no words, and words alone need no links', () => {
    expect(withFileLinks('', [{ name: 'a.csv', stored: 'k-a.csv' }])).toBe('[a.csv](attachments/k-a.csv)');
    expect(withFileLinks('  Hi  ', [])).toBe('Hi');
  });
});

describe('the card and the app send it there', () => {
  it('sends a chat-bound message through toChat and every other message as before', () => {
    expect(composer).toMatch(/goes === 'chat'\s*\?\s*await toChat!\(person\.id, words, files\)/);
    expect(composer).toMatch(/api\.teamMessage\(toMany \?\? person\.id, named\.encode\(text\.trim\(\)\), level, files, asTask \? undefined : messageSubject\(subject\)\)/);
  });

  it('does not offer the old conversation for a message that goes to the chat', () => {
    expect(composer).toMatch(/\{convo && onOpenConversation && sendAs === 'message' && goes === 'direct' && !messageSubject\(subject\) && \(/);
  });

  it('hands the card the chat only while Rooms is live on the team layout', () => {
    expect(app).toMatch(/const oneChat = roomsUi\.live && homeLayout === 'chats';/);
    expect(app).toMatch(/toChat=\{oneChat \? \(id, words, files\) => roomsUi\.startChat\(id, team\?\.byId\.get\(id\)\?\.name \?\? 'Chat', words, files\) : undefined\}/);
  });

  it('sends a shared thread to one person into the chat while Rooms is live', () => {
    expect(app).toMatch(/const out = oneChat && to\.length === 1\s*\?\s*await roomsUi\.startChat\(to\[0\], team\?\.byId\.get\(to\[0\]\)\?\.name \?\? 'Chat', words\)\.then\(\(error\) => \(\{ ok: !error, error: error \?\? undefined \}\)\)\s*:\s*await api\.teamMessage\(to\.length === 1 \? to\[0\] : to, words\);/);
  });

  it('puts the files in the chat before the words that link them', () => {
    expect(rooms).toMatch(/const startChat = async \(personId: string, name: string, first\?: string, files: readonly TeamMessageFile\[\] = \[\]\)/);
    expect(rooms).toMatch(/call\('putFileFrom', id, \{ name: stored, srcPath: f\.srcPath \}\)/);
    expect(rooms).toMatch(/call\('putFile', id, \{ name: stored, dataBase64: f\.dataBase64 \}\)/);
    expect(rooms).toMatch(/const body = withFileLinks\(first \?\? '', put\);/);
  });

  it('opens your page with one teammate rather than the old record, from a room', () => {
    expect(app).toMatch(/onTeamMessage: \(ids\) => \{\s*if \(ids\.length === 1 && homeLayout === 'chats'\) \{ openChatsPlace\(`person:\$\{ids\[0\]\}`\); return; \}/);
  });
});
