// YOUR AI TEAMMATES' WORK IS IN YOUR IN PROGRESS (2026-11-04).
//
// The owner opened In progress to check on a teammate's run and it was not
// there: the list, its count and your board all dropped every row labelled
// `teammate:` (`yoursOnly`), leaving it on the teammate's own place only. Their
// runs under way now sit in your In progress. Later and Done today first stayed
// yours alone; the owner then chose to have them there too
// (your-ai-teammates-threads-sit-on-your-board-under-their-names).
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

describe('your board', () => {
  const board = whoseBoard('me', 'agents', { me: 'p-me', people: ['p-me'], team: null });

  it('holds your AI teammates\' runs, under way or finished', () => {
    expect(boardItems(items, board, mateOf).map((i) => i.id)).toEqual(['mine', 'mates-running', 'mates-finished', 'other-mate']);
  });
});

describe('an AI teammate\'s own board', () => {
  it('still holds only that teammate\'s runs', () => {
    const board = whoseBoard('mate:t-1', 'agents', { me: 'p-me', people: ['p-me'], team: null });
    expect(boardItems(items, board, mateOf).map((i) => i.id)).toEqual(['mates-running', 'mates-finished']);
  });
});

describe('your list and its count', () => {
  it('stack In progress, Later and Done today with your teammates\' runs in them', () => {
    expect(app).toMatch(/stackRows\(\{ progress: shownAs\(progressTab, 'progress'\), later: shownAs\(snoozed, 'snoozed'\), done: shownAs\(done, 'done'\)/);
  });

  it('count the same rows the list draws', () => {
    expect(app).toMatch(/progress: \(mineShown \? shownCount\(progressTab\) : 0\) \+ theirCount\('progress'\)/);
  });

  it('give your card the same number', () => {
    expect(app).toMatch(/const yours = progressTab\.length;/);
  });
});
