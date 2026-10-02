// THE THREE-DOT MENU OFFERS "RUN NOW" ON A WAITING TASK, AND THE TASK SAYS IT
// IS NEXT ONCE IT HAS BEEN PUSHED.
//
// What broke (w-87ff499077, 2026-10-02): a task waiting behind others had no
// way to be started. The workaround, raising its tag and lowering the rest,
// was hard to find and often did nothing (see
// run-now-starts-a-waiting-task-ahead-of-everything.test.mjs for the reasons,
// read off the supervisor). The fix's window half is held here: the menu's row
// appears on a queued task and nowhere else, it comes first, and once pressed
// the task's state word changes from Queued to Up next, so the press visibly
// did something.

import { describe, it, expect } from 'vitest';
import { threadMenuRows } from '../renderer/src/threads/ThreadMenu.tsx';
import { liveLine, shortWord } from '../renderer/src/live-line.ts';

const item = (extra = {}) => ({
  id: 'w-1', product: 'p', status: 'open', kind: 'directive', title: 't',
  labels: ['founder'], priority: 5, createdAt: 0, updatedAt: 0, ...extra,
});

describe('the menu row', () => {
  it('is offered first on a waiting task', () => {
    expect(threadMenuRows({ change: false, terminal: 'closed', finish: true, runNow: true })[0])
      .toEqual({ id: 'run', label: 'Run now', key: null });
  });

  it('sits above the rows that were already there', () => {
    expect(threadMenuRows({ change: true, terminal: 'closed', finish: true, runNow: true }).map((r) => r.id))
      .toEqual(['run', 'code', 'terminal', 'done']);
  });

  // The case that must not match: a task that is running, finished, or not
  // waiting at all has nothing to push.
  it('is not offered on a task that is not waiting', () => {
    expect(threadMenuRows({ change: false, terminal: 'closed', finish: true, runNow: false }).map((r) => r.id))
      .toEqual(['terminal', 'done']);
    expect(threadMenuRows({ change: false, terminal: 'closed', finish: true }).map((r) => r.id))
      .toEqual(['terminal', 'done']);
  });
});

describe('what the task says', () => {
  it('a pushed task says Up next', () => {
    const live = liveLine(item(), { queued: ['w-1'], runNow: ['w-1'], inProgress: true });
    expect(live?.state).toBe('next');
    expect(shortWord(live.state)).toBe('Up next');
  });

  // The boundary on the other side: queued but not pushed still reads Queued.
  it('a waiting task nobody pushed still says Queued', () => {
    const live = liveLine(item(), { queued: ['w-1'], runNow: ['w-other'], inProgress: true });
    expect(live?.state).toBe('queued');
    expect(shortWord(live.state)).toBe('Queued');
  });

  // A push lasts until the run starts, and a running task says Working.
  it('a pushed task that is running says Working, not Up next', () => {
    const session = { itemId: 'w-1', product: 'p', startedAt: 0, tail: [] };
    const live = liveLine(item(), { session, queued: [], runNow: ['w-1'], inProgress: true });
    expect(live?.state).toBe('working');
  });
});
