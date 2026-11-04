// YOUR AI TEAMMATES' WORK IS IN YOUR IN PROGRESS (2026-11-04).
//
// The owner opened In progress to check on a teammate's run and it was not
// there: the list, its count and your board all dropped every row labelled
// `teammate:` (`yoursOnly`), leaving it on the teammate's own place only. Their
// runs under way now sit in your In progress; Later and Done today stay yours.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { boardItems, whoseBoard } from '../renderer/src/team/everything/whose-board.ts';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const mateOf = (i) => i.labels?.find((l) => l.startsWith('teammate:'))?.slice('teammate:'.length) ?? null;

const mine = { id: 'mine', labels: [] };
const matesRunning = { id: 'mates-running', labels: ['teammate:t-1'] };
const matesFinished = { id: 'mates-finished', labels: ['teammate:t-1'] };
const otherMates = { id: 'other-mate', labels: ['teammate:t-2'] };
const items = [mine, matesRunning, matesFinished, otherMates];
const inProgress = (i) => i.id === 'mates-running' || i.id === 'mine';

describe('your board', () => {
  const board = whoseBoard('me', 'agents', { me: 'p-me', people: ['p-me'], team: null });

  it('holds your AI teammates\' runs that are under way', () => {
    expect(boardItems(items, board, mateOf, inProgress).map((i) => i.id)).toEqual(['mine', 'mates-running']);
  });

  it('does not hold their finished or waiting runs, which stay on their own place', () => {
    expect(boardItems(items, board, mateOf, inProgress).map((i) => i.id)).not.toContain('mates-finished');
  });

  it('holds none of theirs when nothing says what is in progress', () => {
    expect(boardItems(items, board, mateOf).map((i) => i.id)).toEqual(['mine']);
  });
});

describe('an AI teammate\'s own board', () => {
  it('still holds only that teammate\'s runs', () => {
    const board = whoseBoard('mate:t-1', 'agents', { me: 'p-me', people: ['p-me'], team: null });
    expect(boardItems(items, board, mateOf, inProgress).map((i) => i.id)).toEqual(['mates-running', 'mates-finished']);
  });
});

describe('your list and its count', () => {
  it('stack In progress with your teammates\' runs in it, and Later and Done today without', () => {
    expect(app).toMatch(/stackRows\(\{ progress: shownAs\(progressTab, 'progress'\), later: shownAs\(yours\(snoozed\), 'snoozed'\), done: shownAs\(yours\(done\), 'done'\)/);
  });

  it('count the same rows the list draws', () => {
    expect(app).toMatch(/progress: !onPhone\(\) \? \{ count: mineShown \? shownCount\(progressTab\) : 0/);
  });

  it('give your card the same number', () => {
    expect(app).toMatch(/const yours = progressTab\.length;/);
  });

  it('hand the board what is in progress', () => {
    expect(app).toMatch(/boardItems\(items, evBoard, teammateIdOf, inProgressNow\)/);
  });
});
