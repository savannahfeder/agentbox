// A COMMENT ON A FILE IN A CHAT SHOWS IN THAT CHAT, AS A THREAD SHOWS ONE.
//
// What broke, 2026-11-22, three of four testers on one team: a comment or a
// reply left on a file someone sent in their chat said "Sent to Sam" in the
// file's notes, and the chat itself showed only the messages and the file, so
// nobody could tell from the chat that anything had been said about it.
// Measured by reading what the chat drew: its rows were the messages and the
// things done alongside, and the room's file comments were none of them.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { commentsInChat } from '../renderer/src/team/rooms/chat-comments';

const mark = (id: string, at: number, by: string, m: Record<string, unknown>) => ({ id, at, by, mark: m });
const marks = [
  mark('m1', 10, 'theo', { do: 'note', id: 'n1', file: 'reminder-email.md', place: { kind: 'quote', text: 'call us' }, text: 'Say the clinic number.' }),
  mark('m2', 20, 'priya', { do: 'reply', id: 'r1', on: 'n1', file: 'reminder-email.md', text: 'Will do.' }),
  mark('m3', 30, 'priya', { do: 'resolve', on: 'n1' }),
  mark('m4', 40, 'theo', { do: 'approve', file: 'reminder-email.md' }),
  mark('m5', 5, 'priya', { do: 'note', id: 'n2', file: 'k3j9x2ab-x7k2-booking-flow-copy.md', place: { kind: 'whole' }, text: 'Shorter, please.' }),
  mark('m6', 50, 'theo', { do: 'seen', on: ['n1'] }),
];

describe('the comments a chat shows', () => {
  const rows = commentsInChat(marks);
  it('every comment and reply on its files, oldest first, and nothing else', () => {
    expect(rows.map((r) => r.id)).toEqual(['n2', 'n1', 'r1']);
  });
  it('each says what it is on, as a thread says it', () => {
    expect(rows.find((r) => r.id === 'n1')).toMatchObject({ by: 'theo', at: 10, text: 'Say the clinic number.', link: { kind: 'note', file: 'reminder-email.md', place: '“call us”' } });
    expect(rows.find((r) => r.id === 'r1')?.link).toMatchObject({ reply: true, file: 'reminder-email.md' });
    expect(rows.find((r) => r.id === 'n2')?.link.place).toBe('Whole file');
  });
  it('none, for a chat whose files have no comments', () => {
    expect(commentsInChat([])).toEqual([]);
    expect(commentsInChat(undefined)).toEqual([]);
    // A chat handed no list of comments (an older caller's stub) draws its messages as before.
    expect(commentsInChat((() => []) as never)).toEqual([]);
  });
});

describe('the chat draws them among its messages', () => {
  const chat = fs.readFileSync(new URL('../renderer/src/team/rooms/RoomChat.tsx', import.meta.url), 'utf8');
  it('reads them from the room\'s file comments and gives each its own head', () => {
    expect(chat).toMatch(/commentsInChat\(calls\.files\?\.marks\)/);
    expect(chat).toContain('<CommentOn e={{ fileMark: d.c.link }} />');
    expect(chat).toContain('<CommentQuote e={{ fileMark: d.c.link }} />');
  });
});
