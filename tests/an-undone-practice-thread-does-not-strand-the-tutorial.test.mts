// AN UNDONE PRACTICE THREAD DOES NOT STRAND THE TUTORIAL (w-fbe5e95dea, 2026-11-10).
//
// The tutorial tells you Z brings back anything you mark done. Round-five
// testers pressed it, and walked on to the agent that is waiting on an answer.
// Driving a copy by hand: after answering it, the card still read "This agent
// is waiting on your answer" over the one row left, the thread Z brought back,
// and nothing moved, because the step waited for every practice thread to
// leave. Once the waiting one is answered, a thread still left sends the walk
// back to the clearing step, which then runs forward on its own.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { START, afterUnblock, type FirstRun } from '../renderer/src/onboarding.ts';

const run: FirstRun = { ...START, step: 'unblock', examples: ['a', 'b', 'wait', 'later'] };
const W = 2;
const rows = (...ids: string[]) => ids.map((id) => ({ id }));

describe('afterUnblock', () => {
  it('goes on when every practice thread has left', () => {
    expect(afterUnblock(rows('mine'), run, W)).toBe('where');
  });
  it('waits while the waiting thread is still in the inbox', () => {
    expect(afterUnblock(rows('wait'), run, W)).toBe(null);
    expect(afterUnblock(rows('a', 'wait'), run, W)).toBe(null);
  });
  it('goes back to clearing when an undone thread is left after the answer', () => {
    expect(afterUnblock(rows('a'), run, W)).toBe('clear');
    expect(afterUnblock(rows('later'), run, W)).toBe('clear');
  });
  it('is nothing without a walk', () => {
    expect(afterUnblock(rows(), null, W)).toBe(null);
  });
  it('is what the app follows', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toMatch(/afterUnblock\(inbox, run, WAITING_AT\)/);
  });
});
