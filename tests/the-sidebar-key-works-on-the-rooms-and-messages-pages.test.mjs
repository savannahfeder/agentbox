// THE SIDEBAR KEY WORKS ON THE ROOMS AND MESSAGES PAGES (w-49cd37092c, 2026-10-22).
//
// "I'm on the rooms page and I'm trying to use the command that should open
// and close the sidebar, but it's not working... also not working on the
// messages page." A room owns the keyboard while it is open, and the Rooms
// page, Find rooms and an empty Messages page all count as an open room
// (useRooms gives them openId 'rooms', 'find' and 'messages'), so its guard
// returned before \ was read. \ now passes the guard, and the one below it
// still stops it while you type, so a \ in a message stays text.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const guard = app.match(/if \(roomShown && ([^{]*)\) \{/)?.[1] ?? '';
const at = (s) => app.indexOf(s);

describe('the keys a room lets through', () => {
  it('lets the sidebar key through', () => {
    expect(guard).toContain("e.key !== '\\\\'");
  });
  it('still lets Tab and N through, and nothing else new', () => {
    expect(guard).toContain("e.key !== 'Tab'");
    expect(guard).toContain("e.key !== 'n'");
    expect(guard.match(/e\.key !==/g)).toHaveLength(4);
  });
});

describe('the sidebar key below the guard', () => {
  it('is read after typing and menus have been stopped, so a \\ in a message stays text', () => {
    const typing = at('if (modal || inInput) {');
    const sidebar = at("if (e.key === '\\\\') {");
    expect(typing).toBeGreaterThan(0);
    expect(sidebar).toBeGreaterThan(typing);
  });
  it('toggles the sidebar', () => {
    expect(app).toMatch(/if \(e\.key === '\\\\'\) \{\s*e\.preventDefault\(\);\s*togglePanel\(\);/);
  });
});
