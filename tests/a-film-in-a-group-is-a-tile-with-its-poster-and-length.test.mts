// A film Sofia attached in a chat was a bare file name chip, with no poster
// frame and no length, where a picture beside it was a tile.
// Measured by drawing a group message that carries an mp4: the
// link went to RoomFile, which draws `rm-file`, the chip a PDF gets. Now a
// film is a tile like a picture's: a dark face with a play mark and its name
// until the file is found on this computer, then its frame and its length.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoomChat } from '../renderer/src/team/rooms/RoomChat.tsx';

const T = new Date(2026, 9, 31, 6, 0).getTime();
const room = { id: 'r1', name: 'Lumen', kind: 'group', teamId: 't', listed: false, inviteOnly: false, role: 'member', members: 3, createdAt: T - 1e9, pinned: false, muted: false, unread: 0, readAt: T + 60_000, lastAt: T, agents: 0, wall: [] };
const people = [{ id: 'p-sofia', name: 'Sofia Reyes', avatarUrl: null, me: true }, { id: 'p-maya', name: 'Maya Chen', avatarUrl: null, me: false }];
const files = { find: async () => null, readText: async () => null, marks: () => [], mark: async () => ({ ok: true }) };
const draw = (body) => renderToStaticMarkup(React.createElement(RoomChat, {
  room, people, meId: 'p-sofia', now: T + 60_000, full: true,
  onSend: async () => null, onRead: () => {}, loadFile: async () => null, files,
  messages: [{ id: 'a', roomId: 'r1', by: 'p-sofia', body, inReplyTo: null, mentions: [], at: T }],
}));

describe('a film in a group message', () => {
  it('is a tile with a play mark and its name, not a chip', () => {
    const html = draw('[launch-cut-v1.mp4](attachments/mh2x-ab12cd-launch-cut-v1.mp4)');
    expect(html).toContain('class="inline-image-open rm-film"');
    expect(html).toContain('file-cover-play');
    expect(html).toContain('launch-cut-v1.mp4');
    expect(html).not.toContain('class="rm-file"');
  });

  it('draws the frame and the length from the file once it is found', () => {
    const chat = fs.readFileSync(new URL('../renderer/src/team/rooms/RoomChat.tsx', import.meta.url), 'utf8');
    expect(chat).toMatch(/<FileCover kind="film" opened=\{path\} onSize=\{setLength\} \/>/);
    expect(chat).toContain('rm-film-length');
  });
});

describe('what is not a film', () => {
  it('a PDF is still the chip', () => {
    expect(draw('[deck.pdf](attachments/mh2x-ab12cd-deck.pdf)')).toContain('class="rm-file"');
  });

  it('a voice note is still a voice note', () => {
    expect(draw('[voice-note-3000ms.webm](attachments/voice-note-3000ms.webm)')).not.toContain('rm-film');
  });
});
