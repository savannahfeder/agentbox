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
  it('wears a plate', () => {
    expect(menu).toContain('<button type="button" className="ts-done ts-close-task" data-hint="close-task" data-hint-align="right" onClick={onCloseTask}>');
  });
  it('that says it closes the task for both of you', () => {
    expect(HINTS['close-task']).toEqual([{ key: '', what: 'Close the task for both of you' }]);
  });
  it('while Done still says it is the E key', () => {
    expect(HINTS.done).toEqual([{ key: 'E', what: 'Mark done' }]);
  });
});
