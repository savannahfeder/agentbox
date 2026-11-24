// A THREAD REPLY OPENED FROM NEEDS YOU OPENS ON THAT REPLY.
//
// In a power test Sam clicked Lena's "Thanks, Sam" in Needs you, a reply under
// his own message in the team chat (the row said "Lena F. in your thread").
// The chat opened on its main list, where a reply is drawn only as "2 replies"
// under the message it answers, so the words he had clicked were nowhere on
// screen. A found reply already opens its side thread (RoomChat listens for
// LINE_MISSING after revealLine); the Needs you row never asked for its line.
// Measured on the line the row asks for and on where openMention asks for it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mentionLine } from '../renderer/src/team/rooms/room-rules.ts';

const row = { messageId: 'm-thanks', thread: null as 'yours' | 'theirs' | null };

describe('the line a group row in Needs you opens on', () => {
  it('is the reply, for a reply in a thread you started or are in', () => {
    expect(mentionLine({ ...row, thread: 'yours' })).toBe('m-thanks');
    expect(mentionLine({ ...row, thread: 'theirs' })).toBe('m-thanks');
  });
  it('is none for a message in the chat itself, which opens where it always has', () => {
    expect(mentionLine(row)).toBe(null);
    expect(mentionLine({ messageId: 'm-thanks' })).toBe(null);
  });
  it('is asked for when the row is opened', () => {
    const src = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/team/rooms/useRooms.tsx'), 'utf8');
    expect(src).toMatch(/const openMention = [^\n]*\n(?:.*\n){0,3}.*const line = mentionLine\(m\);\n\s+if \(line\) revealLine\(line\);/);
  });
});
