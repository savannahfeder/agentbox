// CLOSE TASK SAYS IT CLOSES IT FOR BOTH.
//
// On a task between people the top bar has Close task beside Done, and three
// testers could not tell them apart. Done takes it out of your own inbox, with
// E; Close task closes the task for you and the person you gave it to. Done had
// a hover plate and Close task had none, so nothing on screen said which was which.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { HINTS } from '../renderer/src/hint-plate.ts';

const menu = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/threads/ThreadMenu.tsx'), 'utf8');

describe('Close task', () => {
  // w-f702d60afe, 2026-11-21: two buttons side by side still read as one thing
  // said twice, so the top bar keeps Done and Close task lives in the menu,
  // where its row says who it closes it for.
  it('is not a second button beside Done', () => {
    expect(menu).not.toContain('ts-close-task');
  });
  it('is a menu row that says it is for both of you', () => {
    expect(menu).toContain("if (closeTask) rows.push({ id: 'close-task', label: 'Close task', key: null, detail: 'For both of you' });");
  });
  it('while Done still says it is the E key', () => {
    expect(HINTS.done).toEqual([{ key: 'E', what: 'Mark done' }]);
  });
});
