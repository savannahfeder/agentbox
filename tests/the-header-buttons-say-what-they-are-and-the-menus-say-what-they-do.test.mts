// THE HEADER BUTTONS SAY WHAT THEY ARE, AND THE MENUS SAY WHAT THEY DO.
//
// The owner, 2026-11-02: "hovering over these components tho doesn't give
// keyboard shortcuts or (if not) an indication of what they are. and when i do
// certain things like the share button idk what it does tbh. would be nice to
// have some text like at the top here before margarette that tells me what
// it'll do (will it share the thread, and can they contribute too or will it
// share the artifact etc.?). same with waits on and give it to someone else."
// The icon buttons over a thread (Add people, Files, where it runs, More) wore
// only a native title, and the three menus opened straight onto names.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { HINTS } from '../renderer/src/hint-plate.ts';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');

describe('hovering a button over a thread', () => {
  it('names each icon button on the hint plate', () => {
    for (const id of ['add-people', 'add-to-group', 'thread-files', 'runs-on', 'more']) expect(HINTS[id]?.[0]?.what, id).toBeTruthy();
    expect(read('renderer/src/team/TeamFocus.tsx')).toMatch(/data-hint="add-people"/);
    expect(read('renderer/src/team/TeamFocus.tsx')).toMatch(/data-hint="add-to-group"/);
    expect(read('renderer/src/threads/ThreadFiles.tsx')).toMatch(/data-hint="thread-files"/);
    expect(read('renderer/src/threads/PlaceButton.tsx')).toMatch(/data-hint="runs-on"/);
    expect(read('renderer/src/threads/ThreadMenu.tsx')).toMatch(/data-hint="more"/);
  });

  it('draws no empty key caps for a button that has no key', () => {
    expect(read('renderer/src/components/HintPlate.tsx')).toMatch(/capsFor\(line\.key\)\.length > 0 &&/);
  });
});

describe('a menu over a thread says what picking does', () => {
  it('Add people says they see the thread and its files and can comment', () => {
    expect(read('renderer/src/team/TeamFocus.tsx')).toMatch(/<p className="tm-menu-say">They see this thread and its files and can comment\.<\/p>/);
  });

  // Since a person can be asked for help or a review as well (shared/thread-asks.mts), the list says so when they can.
  // The AI half only when an AI teammate is in the list: with only Priya there,
  // the PM tester could not tell whether a person or an AI got it (round six).
  it('Ask or hand off says what a person gets, and that an AI teammate starts on it when one is listed', () => {
    const menu = read('renderer/src/threads/ThreadMenu.tsx');
    expect(menu).toContain("onAsk ? 'Ask a person for help or a review, or hand it over.' : 'A person gets it as a task in their Needs you.')");
    expect(menu).toContain("(listed.some((p) => p.id.startsWith('mate:')) ? ' An AI teammate starts on it.' : '')");
  });

  it('Waits on says where it goes and when it comes back', () => {
    expect(read('renderer/src/threads/ThreadMenu.tsx')).toMatch(/<p className="ts-menu-say">\{blocks \? 'Blocked until that is done\.' : 'It moves to Later and comes back when that is done\.'\}<\/p>/);
  });
});
