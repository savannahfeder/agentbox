// A CHAT DRAWS ITS DAY AS A WORD, NOT A LINE.
//
// The owner, 2026-11-03, over a thread in a group: "feels like we're overdoing
// the hairline dividers in messages. not sure we need them at all (just the
// today label or something)". "Today" sat between two hairlines, and the message
// a thread opens on had a third under it. The day stays as a quiet word; the
// lines go, in group chats, chats with a person, AI teammates' chats and the
// conversations in a thread. The orange New marker is not a divider and stays.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const rooms = read('renderer/src/team/rooms/rooms.css');
const mates = read('renderer/src/teammates/teammates.css');
const chat = read('renderer/src/team/chat.css');

describe('the day in a chat', () => {
  // Then: "can you left align the 'today'?" It starts on the messages' own left edge.
  it('is a word on the left, with no line either side', () => {
    expect(rooms).toMatch(/^\.rm-day \{ display: flex; justify-content: flex-start;/m);
    expect(mates).toMatch(/^\.tq-chats \.tq-chat \.rm-day \{ display: flex; justify-content: flex-start;/m);
    expect(rooms).not.toMatch(/\.rm-day::before|\.rm-day::after/);
    expect(mates).not.toMatch(/\.rm-day::before|\.rm-day::after/);
  });
  it('in a chat with a person drawn inside a thread too', () => {
    expect(chat).not.toMatch(/\.chat-day::after \{ content: ''/);
  });
});

describe('the message a thread opens on', () => {
  it('has no line under it', () => {
    expect(rooms).toMatch(/^\.rm-cm\.root \{ padding-bottom: 12px; margin-bottom: 4px; \}/m);
  });
});

describe('the New marker', () => {
  it('still draws its line: it marks where you stopped reading', () => {
    expect(rooms).toMatch(/\.rm-new::before, \.rm-new::after \{[^}]*background: var\(--accent\)/);
  });
});
