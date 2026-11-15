// The power test of 2026-10-25 pressed B with two teammates set up: Needs you
// held two identical "Set up its job" cards, and a message written to a
// teammate sat in In progress as a plain card. The list's rows say whose a
// thread is (TeammateLead); the board's cards did not.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const pages = fs.readFileSync(new URL('../renderer/src/threads/Pages.tsx', import.meta.url), 'utf8');
const board = pages.slice(pages.indexOf('export function InboxBoard('));

describe('a card on the board', () => {
  it('starts with the teammate it belongs to, as a row in the list does', () => {
    expect(board).toMatch(/<div className="t">\{e\.item && <TeammateLead item=\{e\.item\} \/>\}/);
  });
});
