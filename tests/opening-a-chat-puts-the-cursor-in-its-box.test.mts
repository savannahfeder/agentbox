// OPENING A CHAT PUTS THE CURSOR IN ITS BOX.
//
// A tester opened Dev's page in Team, and a group from the command bar, and
// started typing a message. The box was drawn but not focused, so the letters
// ran as the app's one-key shortcuts and Enter opened an agent thread. A chat
// that is the page (a group's page, a person's page) now takes the typing as
// it opens; a chat drawn beside something else, like a room's board, does not.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const chat = read('renderer/src/team/rooms/RoomChat.tsx');
const place = read('renderer/src/team/everything/PlacePage.tsx');

describe('a chat that is the page', () => {
  it('focuses its reply box when it opens, and when its thread opens', () => {
    expect(chat).toMatch(/useEffect\(\(\) => \{ if \(takesTyping\) requestAnimationFrame\(\(\) => ref\.current\?\.focus\(\)\); \}, \[\]\);/);
    expect(chat).toMatch(/takesTyping=\{full \|\| !!thread\}/);
  });
  it('a person’s first message box too', () => {
    expect(place).toMatch(/<textarea className="rm-compose-input" autoFocus /);
  });
});
