// Since 4594ed744 (2026-11-04) the desktop's ⌘K names a page as "Go to Inbox",
// "Go to In progress", "Go to Later" and "Go to Done" (palette-rows.ts
// `pageRows`), and its filters row is "Filter…" (Palette.tsx). The phone's
// command bar still said "Needs you", "In progress", "Later", "Done" and "View
// and filters". Found by the phone parity audit of 2026-11-21.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { phoneCommands } from '../mobile/src/lib/palette';

const rows = fs.readFileSync('renderer/src/palette-rows.ts', 'utf8');
const desk = fs.readFileSync('renderer/src/components/Palette.tsx', 'utf8');
const label = (id: string, team = false) => phoneCommands({ team, computer: null }).find((c) => c.id === id)?.label;
const find = (words: string) => phoneCommands({ team: false, computer: null }).filter((c) => `${c.label} ${c.keywords ?? ''}`.toLowerCase().includes(words)).map((c) => c.id);

describe("the phone's command bar", () => {
  it('names the pages as the desktop does', () => {
    for (const words of ["'Go to Inbox'", "'Go to In progress'", "'Go to Later'", '`Go to ${DONE.short}`']) expect(rows).toContain(words);
    expect(label('inbox')).toBe('Go to Inbox');
    expect(label('progress')).toBe('Go to In progress');
    expect(label('later')).toBe('Go to Later');
    expect(label('done')).toBe('Go to Done');
  });
  it('names the team places the same way', () => {
    expect(label('chats', true)).toBe('Go to Chats');
  });
  it('calls the filters row Filter…', () => {
    expect(desk).toContain("{ id: 'filter', label: 'Filter…'");
    expect(label('filter')).toBe('Filter…');
  });
  it('still finds Inbox by the words Needs you', () => {
    expect(find('needs you')).toContain('inbox');
  });
});
