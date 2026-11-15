// THE MENTION LIST RISES OFF THE BOX YOU TYPE IN.
//
// Typing "@So" in a group chat opened Sofia's name at the top-left of the chat,
// under the header, far from the reply box at the bottom; a tester "almost
// missed it". The list was absolutely placed with no offsets, so it sat wherever
// the page's layout put its static place, which in Team is the top of the chat.
// Measured from a 1440x900 screenshot of a group opened from Team.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const chat = read('renderer/src/team/rooms/RoomChat.tsx');
const css = read('renderer/src/team/rooms/rooms.css');

describe('the @ list in a group chat', () => {
  it('lives inside the reply box', () => {
    const box = chat.indexOf('<div className="rm-compose">');
    const list = chat.indexOf('className="rm-picker rm-pop rm-menu"');
    expect(box).toBeGreaterThan(-1);
    expect(list).toBeGreaterThan(box);
    expect(chat).not.toContain("rm-menu\" style={{ position: 'absolute' }}");
  });
  it('sits just above that box, on its left edge', () => {
    expect(css).toMatch(/^\.rm-compose \{[^}]*position: relative;/m);
    expect(css).toMatch(/^\.rm-compose > \.rm-picker \{ position: absolute; bottom: calc\(100% \+ 6px\); left: 0;/m);
  });
});
