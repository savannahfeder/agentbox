// ⌘K, "rem", and which of the two rows sits under her return key.
//
// Reported 2026-09-22, with a picture of the palette: typing "rem" to reach
// Remind Me kept selecting Remote Control instead.
//
// Nothing was broken in the sense a program notices. Both rows are honest
// matches for "rem", and the palette showed them in the order the list was
// assembled in, which put Remote Control first because it was added next to
// Open Terminal at the head of the focused block. Typing three letters and
// pressing return therefore did the thing she does rarely instead of the thing
// she does all day.
//
// So the only way to catch it is to type her letters at the list and look at
// what comes back first, which is this file.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { matchesQuery, rankMatches } from '../renderer/src/palette-rows.ts';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// The item commands as App.tsx assembles them over a focused row, in order,
// with the two labels from her screenshot spelled exactly as the app says them.
// The ids are the link this fix hangs on, and the last test below is what keeps
// them true.
const ITEM_COMMANDS = [
  { id: 'remote-control', label: 'Remote Control', keywords: 'phone mobile continue claude rc' },
  { id: 'open-terminal', label: 'Open Terminal', keywords: 'shell command console' },
  { id: 'done', label: 'Close This Task' },
  { id: 'reply', label: 'Reply' },
  { id: 'read', label: 'Mark Read' },
  { id: 'snooze', label: 'Remind Me (Snooze)' },
];

const type = (query, rows = ITEM_COMMANDS) =>
  rankMatches(query, rows.filter((c) => matchesQuery(query, c))).map((c) => c.id);

describe('typing "rem"', () => {
  // THE REPORTED BUG. This returned ['remote-control', 'snooze'].
  it('puts Remind Me under her return key, with Remote Control still there', () => {
    expect(type('rem')).toEqual(['snooze', 'remote-control']);
  });

  it('is the same whichever way she capitalises it', () => {
    expect(type('REm')).toEqual(['snooze', 'remote-control']);
  });

  it('still finds Remote Control on its own one letter later', () => {
    expect(type('remo')).toEqual(['remote-control']);
  });

  it('and by the word she would look for it under', () => {
    expect(type('remote')).toEqual(['remote-control']);
    expect(type('phone')).toEqual(['remote-control']);
  });
});

describe('everything else in the list', () => {
  it('keeps the order the palette assembled it in', () => {
    // "e" is in every one of these labels, so this is the whole list ranked.
    // One row moves; the other five are exactly where they were.
    expect(type('e')).toEqual(['snooze', 'remote-control', 'open-terminal', 'done', 'reply', 'read']);
  });

  it('is not sorted at all when she has typed nothing', () => {
    expect(rankMatches('', ITEM_COMMANDS)).toBe(ITEM_COMMANDS);
    expect(rankMatches('   ', ITEM_COMMANDS)).toBe(ITEM_COMMANDS);
  });

  it('is left alone on a query Remind Me does not answer to', () => {
    // No "a" anywhere in "Remind Me (Snooze)", so nothing is hoisted here and
    // Remote Control keeps the head of the list it already had. It matches on
    // the "a" in its own keywords, which are searched and never shown.
    expect(type('a')).toEqual(['remote-control', 'open-terminal', 'done', 'read']);
  });

  // "re" is the two letters before the bug, and Remind Me answers to those as
  // honestly as Remote Control does, so it leads here too.
  it('leads on the shorter prefix as well', () => {
    expect(type('re')).toEqual(['snooze', 'remote-control', 'reply', 'read']);
  });

  it('does not invent a row that was filtered out', () => {
    expect(type('nothing here')).toEqual([]);
  });
});

describe('the wiring', () => {
  // The rank is keyed on the command's id, so a rename in App.tsx would undo
  // this silently and the palette would go back to what she photographed.
  it('App.tsx still calls the Remind Me row "snooze"', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).toContain("{ id: 'snooze', label: 'Remind Me (Snooze)'");
    expect(app).toContain("{ id: 'snooze', label: `Remind Me (Snooze ${n} selected)`");
  });

  it('the palette ranks what it filters', () => {
    expect(read('renderer/src/components/Palette.tsx')).toContain('rankMatches(q, commands.filter');
  });
});
