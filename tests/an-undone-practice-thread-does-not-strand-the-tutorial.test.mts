// AN UNDONE PRACTICE THREAD DOES NOT STRAND THE TUTORIAL (w-fbe5e95dea, 2026-11-10).
//
// The tutorial tells you Z brings back anything you mark done. Round-five
// testers pressed it, and walked on to the agent that is waiting on an answer.
// Driving a copy by hand: after answering it, the card still read "This agent
// is waiting on your answer" over the one row left, the thread Z brought back,
// and nothing moved, because the step waited for every practice thread to
// leave. Once the waiting one is answered, a thread still left sends the walk
// back to the clearing step, which then runs forward on its own.
//
// Round six (2026-11-10): both testers pressed Z on their OWN practice thread,
// the one they wrote, not an example, and still read "Your inbox is now empty"
// with it in Needs you. Their thread counts as well now.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { START, afterUnblock, clearIds, finishedCleared, type FirstRun } from '../renderer/src/onboarding.ts';

const run: FirstRun = { ...START, step: 'unblock', item: 'mine', examples: ['a', 'b', 'wait', 'later'] };
const W = 2;
const rows = (...ids: string[]) => ids.map((id) => ({ id }));

describe('afterUnblock', () => {
  it('goes on when every practice thread has left', () => {
    expect(afterUnblock(rows('real'), run, W)).toBe('where');
  });
  it('waits while the waiting thread is still in the inbox', () => {
    expect(afterUnblock(rows('wait'), run, W)).toBe(null);
    expect(afterUnblock(rows('a', 'wait'), run, W)).toBe(null);
  });
  it('goes back to clearing when an undone thread is left after the answer', () => {
    expect(afterUnblock(rows('a'), run, W)).toBe('clear');
    expect(afterUnblock(rows('later'), run, W)).toBe('clear');
  });
  it('goes back to clearing when it is your own thread Z brought back', () => {
    expect(afterUnblock(rows('mine'), run, W)).toBe('clear');
  });
  it('is nothing without a walk', () => {
    expect(afterUnblock(rows(), null, W)).toBe(null);
  });
  it('is what the app follows', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toMatch(/afterUnblock\(inbox, run, WAITING_AT\)/);
  });
});

describe('the clearing step', () => {
  // Round seven: with it last, the ring and E sat on an example while the thread
  // Z brought back was drawn above it.
  it('points at your own thread first when Z brought it back', () => {
    expect(clearIds(rows('a', 'mine'), run, 2, 3)).toEqual(['mine', 'a']);
    expect(clearIds(rows('mine', 'wait'), run, 2, 3)).toEqual(['mine']);
  });
  it('is not finished while your own thread is back', () => {
    expect(finishedCleared(rows('mine'), run, 2, 3)).toBe(false);
    expect(finishedCleared(rows('wait', 'later'), run, 2, 3)).toBe(true);
  });
});

describe('the inbox-zero line', () => {
  it('counts your own thread among what is left', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toMatch(/unfinished=\{run \? \[\.\.\.run\.examples, run\.item\]\.filter/);
  });
});
