// THE PHONE HAS NO EVERYTHING ELSE, AND EVERY STATE IS A TAB (2026-11-22).
//
// With a team on, the phone app's tabs were Needs you, Everything else, Chats
// and Files. Everything else drew the team as cards ("Your team" among them)
// with In progress, Later and Done as small words under your own card. The
// desktop gave each state its own tab on 2026-11-09 and the phone never
// followed: "there's no Everything Else. It's just Needs You, In Progress,
// Later, and Done." Measured by calling bottomTabs(true), which answered
// Everything else, and by reading app/index.tsx, which drew EverythingPlace.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { bottomTabs } from '../mobile/src/lib/groups';
import { phoneCommands } from '../mobile/src/lib/palette';

const inbox = fs.readFileSync('mobile/src/app/index.tsx', 'utf8');
const labels = (team: boolean, board = false) => bottomTabs(team, board).map((t) => t.label);

describe('the tabs', () => {
  it('are the four states, then Chats and Files, with a team on', () => {
    expect(labels(true)).toEqual(['Needs you', 'In progress', 'Later', 'Done', 'Chats', 'Files']);
  });
  it('are the four states and Files with no team, as they were', () => {
    expect(labels(false)).toEqual(['Needs you', 'In progress', 'Later', 'Done', 'Files']);
  });
  it('name no place called everything', () => {
    for (const team of [true, false]) expect(bottomTabs(team).map((t) => t.id)).not.toContain('everything');
  });
});

describe('the board, which holds all four states as columns', () => {
  it('stands for them as one tab, so Chats and Files are still a tap away', () => {
    expect(labels(true, true)).toEqual(['Board', 'Chats', 'Files']);
    expect(labels(false, true)).toEqual(['Board', 'Files']);
    expect(bottomTabs(true, true)[0].id).toBe('inbox');
  });
  it('is the same board with a team on or off, and counts nothing beside its word', () => {
    expect(inbox).toMatch(/const board = useMemo\(\(\) => \(display\.view === 'board' \? phoneBoard\(c\.view, c\.tabs, display, c\.now, agent\) : null\)/);
    expect(inbox).toMatch(/<Tabs on=\{tab\} counts=\{board \? \{ \.\.\.counts, inbox: 0 \} : counts\} pick=\{setPlace\} team=\{teamMode\} board=\{!!board\} \/>/);
  });
  it('names the teammate whose run a card is, now that no card of theirs holds it', () => {
    expect(inbox).toMatch(/mateOf\(e\.item, c0\.team\)\?\.name \?\? e\.agent/);
  });
});

describe('the page', () => {
  it('draws no team cards and keeps no second set of tabs', () => {
    expect(inbox).not.toMatch(/EverythingPlace|onEverything|mineTab|evView|myItems/);
    expect(fs.existsSync('mobile/src/ui/Everything.tsx')).toBe(false);
    expect(fs.existsSync('mobile/src/lib/everything.ts')).toBe(false);
  });
  it('lists every thread in a state under its tab, a teammate\'s run included', () => {
    expect(inbox).toMatch(/const rows = shown\.rows\[tab\];/);
  });
});

describe('the command list', () => {
  const ids = (team: boolean) => phoneCommands({ team }).map((c) => c.id);
  it('goes to each state and to Chats, and to no Everything else', () => {
    expect(ids(true)).toEqual(expect.arrayContaining(['inbox', 'progress', 'later', 'done', 'chats', 'files']));
    expect(ids(true)).not.toContain('everything');
  });
  it('still offers Chats only with a team', () => {
    expect(ids(false)).not.toContain('chats');
    expect(ids(false)).toEqual(expect.arrayContaining(['inbox', 'progress', 'later', 'done', 'files']));
  });
  it('still reaches what shipped this week, which the team\'s card used to open', () => {
    expect(phoneCommands({ team: true }).find((c) => c.id === 'team-list-shipped')).toMatchObject({ act: { push: '/shipped' } });
  });
});
