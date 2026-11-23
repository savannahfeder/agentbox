// A FILE IN TEAM CHAT WEARS A FILE MARK (w-f702d60afe, 2026-11-21).
//
// A polish review of the group chat: "team-look.md" sat in a plain box, the one
// file link in the app with no file mark beside its name.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const chat = fs.readFileSync(new URL('../renderer/src/team/rooms/RoomChat.tsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../renderer/src/team/rooms/rooms.css', import.meta.url), 'utf8');

describe('a file chip in chat', () => {
  it('draws the mark before the name when it is not a picture or a film', () => {
    expect(chat).toContain('{children ?? <><FileChipMark />{shown}</>}');
  });
  it('lines the mark up with the name in both chip styles', () => {
    expect(css).toContain('.rm-file > svg { flex: none; color: var(--text-faint); }');
    expect(css).toMatch(/\.rm-cm \.rm-file \{ display: inline-flex; align-items: center; gap: 6px;/);
  });
});
