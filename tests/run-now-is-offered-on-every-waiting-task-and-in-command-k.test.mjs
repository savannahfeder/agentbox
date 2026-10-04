// RUN NOW IS OFFERED ON EVERY TASK THAT IS IN PROGRESS WITH NOTHING RUNNING,
// IN THE THREE-DOT MENU AND IN ⌘K, AND A PRESS THAT CANNOT START IT SAYS WHY.
//
// What broke (w-09be058d09, 2026-10-04): an Urgent task in a lower project sat
// In progress for over an hour with every slot full, and its three-dot menu
// offered only Open terminal and Mark done. Urgent alone could not move it
// (a project's place outranks a tag, so it never interrupts a higher project's
// work), and the one thing built for exactly that, Run now, was not there.
// Measured: on the real store that task passed every filter of the supervisor's
// waiting list when rebuilt cold, yet the running app's list did not carry it,
// so the menu, which asked ONLY that list, hid the row. ⌘K never had Run now
// at all, and ⌘K is the searchable form of every action.
//
// So the menu and ⌘K now ask one rule: no session on the task, not already
// pushed, and either on the waiting list or In progress by the tab's own rule.
// The supervisor refuses a push it could not act on (agents paused, scheduled
// for later, held by another session) with a reason the toast can say, rather
// than accepting it and starting nothing.

import { describe, it, expect } from 'vitest';
import { offersRunNow, runNowCommands } from '../renderer/src/run-now.ts';
import { Supervisor } from '../main/supervisor.mjs';

const task = (extra = {}) => ({
  id: 'w-1', product: 'p', status: 'open', kind: 'directive', title: 't',
  labels: ['founder'], priority: 9, createdAt: 0, updatedAt: 0, ...extra,
});
const session = { itemId: 'w-1', product: 'p', startedAt: 0, tail: [] };

describe('when Run now is offered', () => {
  it('on a task the waiting list carries', () => {
    expect(offersRunNow(task(), { queued: ['w-1'], runNow: [], inProgress: true })).toBe(true);
  });

  // The reported case: In progress, nothing running, and the waiting list in
  // the window does not name it.
  it('on a task In progress that the waiting list does not name', () => {
    expect(offersRunNow(task(), { queued: [], runNow: [], inProgress: true })).toBe(true);
    expect(offersRunNow(task(), { queued: undefined, runNow: undefined, inProgress: true })).toBe(true);
  });

  it('not on a task that is running', () => {
    expect(offersRunNow(task(), { session, queued: ['w-1'], runNow: [], inProgress: true })).toBe(false);
  });

  it('not on a task already pushed, which says Up next instead', () => {
    expect(offersRunNow(task(), { queued: ['w-1'], runNow: ['w-1'], inProgress: true })).toBe(false);
  });

  // The case that must not match: a task in the inbox or finished has nothing
  // coming, so there is nothing to push ahead.
  it('not on a task that is neither waiting nor In progress', () => {
    expect(offersRunNow(task(), { queued: ['w-other'], runNow: [], inProgress: false })).toBe(false);
    expect(offersRunNow(task({ status: 'done' }), { queued: [], runNow: [], inProgress: false })).toBe(false);
  });

  it('not on a row standing for an agent outside the app', () => {
    expect(offersRunNow(task({ agent: true }), { queued: [], runNow: [], inProgress: true })).toBe(false);
  });
});

describe('⌘K', () => {
  it('offers Run Now on a waiting task, findable by "run"', () => {
    let ran = 0;
    const cmds = runNowCommands(task(), { queued: [], runNow: [], inProgress: true }, () => { ran += 1; });
    expect(cmds).toHaveLength(1);
    expect(cmds[0].label).toBe('Run Now');
    expect(cmds[0].label.toLowerCase()).toContain('run');
    cmds[0].run();
    expect(ran).toBe(1);
  });

  it('offers nothing on a running task', () => {
    expect(runNowCommands(task(), { session, queued: [], runNow: [], inProgress: true }, () => {})).toEqual([]);
  });
});

describe('a press the supervisor cannot act on says why', () => {
  const build = (items) => {
    const sup = new Supervisor(
      { home: '/nonexistent-home', storeRoot: '/nonexistent-zero-root', maxConcurrentSessions: 1, authProfiles: ['default'] },
      { listItems: () => items, listProducts: () => [], isDue: (i, now) => !(i.runAt > now), settleAnswer() {} },
      '/nonexistent-app',
    );
    sup._saveState = () => {};
    sup.wake = () => {};
    return sup;
  };

  it('accepts an ordinary waiting task', () => {
    expect(build([task()]).runNow('p', 'w-1')).toEqual({ ok: true });
  });

  it('refuses while agents are paused', () => {
    const sup = build([task()]);
    sup.paused = true;
    expect(sup.runNow('p', 'w-1')).toEqual({ ok: false, reason: 'paused' });
    expect(sup._runNow.has('w-1')).toBe(false);
  });

  it('refuses a task scheduled for later', () => {
    const sup = build([task({ runAt: Date.now() + 3_600_000 })]);
    expect(sup.runNow('p', 'w-1')).toEqual({ ok: false, reason: 'scheduled' });
  });

  it('refuses a task another session still holds', () => {
    const sup = build([task({ status: 'claimed', claim: { holder: 'mcp-1', leaseUntil: Date.now() + 60_000 }, claimExpired: false })]);
    expect(sup.runNow('p', 'w-1')).toEqual({ ok: false, reason: 'held' });
  });

  // The boundary: a lease that has lapsed holds nothing.
  it('accepts a task whose old lease has lapsed', () => {
    const sup = build([task({ status: 'claimed', claim: { holder: 'mcp-1', leaseUntil: 1 }, claimExpired: true })]);
    expect(sup.runNow('p', 'w-1')).toEqual({ ok: true });
  });
});
