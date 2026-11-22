// The desktop's People list says "Hasn’t opened Agentbox yet" under someone
// who never opened the app, and nothing under someone idle (GroupPage.tsx
// `onWords`); it dropped "Not on Groups yet" in 75a25345e. Its chat draws a
// page mark before a file's name (RoomChat.tsx `FileChipMark`, 2f3d7bfc3).
// The phone still said "Not on Groups yet" and "Not running", and drew a
// paperclip on a sent file. Found by the phone parity audit of 2026-11-21.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { onWords } from '../mobile/src/lib/groups';
import { Name } from '../shared/product-name.mjs';

const chat = fs.readFileSync('renderer/src/team/rooms/RoomChat.tsx', 'utf8');
const groups = fs.readFileSync('mobile/src/ui/Groups.tsx', 'utf8');
const icons = fs.readFileSync('mobile/src/ui/icons.tsx', 'utf8');
type Card = Parameters<typeof onWords>[0];
const card = (over: Partial<Card>) => ({ id: 'p', name: 'Maya Chen', ...over }) as Card;

describe("the phone's People list", () => {
  it('says the desktop words for someone who has not opened the app', () => {
    expect(onWords(card({ away: true }))).toBe(`Hasn’t opened ${Name} yet`);
  });
  it('says nothing more under someone idle, and their own status when they set one', () => {
    expect(onWords(card({ agents: 0 }))).toBe('');
    expect(onWords(card({ agents: 0, status: 'At lunch' }))).toBe('At lunch');
  });
  it('still says what a working person is on', () => {
    expect(onWords(card({ agents: 2, workingOn: 'Pricing page' }))).toBe('Pricing page');
  });
});

describe("a file in the phone's chat", () => {
  it('wears the page mark the desktop draws', () => {
    expect(chat).toContain('<path d="M4 2.5h5l3 3v8H4z M9 2.5v3h3" strokeLinejoin="round" />');
    expect(icons).toMatch(/export const FileMark = [^\n]*\n[^\n]*viewBox="0 0 16 16"[^\n]*<Path d="M4 2\.5h5l3 3v8H4z M9 2\.5v3h3" strokeLinejoin="round" \/>/);
    expect(groups).toMatch(/<FileMark size=\{14\} \/>\s*<T numberOfLines=\{1\}/);
  });
});
