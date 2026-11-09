// A WAITING THREAD IS IN LATER, NEVER IN PROGRESS (w-5244c90c33).
//
// What broke, 2026-10-11: two threads sat in In progress reading "waiting"
// for days, nothing running on either. "Launch video: Agentbox now runs every
// harness" waited on OpenCode and Hermes; Hermes waited on OpenCode and the
// engine interface. Their words: "they would be lost had i not found them.
// should never happen", and the tabs as they mean them:
//   - In progress is either running or queued
//   - Needs you is things that need human eyes (or are stuck)
//   - Later is things happening later or that can be processed later
//
// And on the second round: "something that's waiting should be logically in
// the backlog and then it should automatically resume without the user
// needing to know otherwise." So a parked thread with a wait is in Later, and
// the supervisor puts a worker back on it when what it waits on finishes
// (tests/a-waiting-thread-resumes-by-itself-when-what-it-waits-on-finishes).
//
// 3a6cd1d named the ways a wait can lose a thread, and each is pinned below:
// a loop of threads waiting on each other (nothing would ever resume it), and
// a thread you stopped yourself (the supervisor never resumes those). Both
// stay in Needs you.
import { describe, it, expect } from 'vitest';
import { belongsInInbox, belongsInProgress, belongsOnTheRail, waitsInLater, waitsThatCanEnd } from '../renderer/src/list-rules.ts';

const NOW = 1_760_000_000_000;

const row = (id, over = {}) => ({
  id, status: 'open', kind: 'task', labels: [], createdAt: NOW - 86_400_000, updatedAt: NOW - 86_400_000, ...over,
});

// The four real shapes from the screenshot's store, ids shortened.
const engine = row('w-engine', { kind: 'refactor', parent: 'w-research' });
const opencode = row('w-opencode', { kind: 'feature', parent: 'w-research' });
const parked = { wrote: { status: { ts: NOW - 1000, source: 'agent' } } };
const hermes = row('w-hermes', { status: 'blocked', parent: 'w-research', blockedBy: ['w-engine', 'w-opencode'], result: 'Nothing new to do.', ...parked });
const video = row('w-video', { status: 'blocked', kind: 'marketing', parent: 'w-research', blockedBy: ['w-opencode', 'w-hermes'], result: 'What do you want first?', ...parked });

const byIdOf = (...rows) => new Map(rows.map((r) => [r.id, r]));

// What the window hands each list.
const placed = (i, byId, claims = {}) => {
  const waitingOn = waitsThatCanEnd(i, byId);
  const c = { now: NOW, ...claims, waitingOn };
  return {
    inbox: belongsInInbox(i, c),
    progress: belongsInProgress(i, c),
    later: waitsInLater(i, waitingOn) && !c.live && !c.shipping,
    rail: belongsOnTheRail(i, c),
  };
};

describe('the two threads from the screenshot', () => {
  const byId = byIdOf(engine, opencode, hermes, video);

  it('both wait on threads that are still open', () => {
    expect(waitsThatCanEnd(hermes, byId)).toEqual(['w-engine', 'w-opencode']);
    expect(waitsThatCanEnd(video, byId)).toEqual(['w-opencode', 'w-hermes']);
  });

  it('so both are in Later, and in neither In progress nor Needs you', () => {
    for (const i of [hermes, video]) {
      const p = placed(i, byId);
      expect(p.later).toBe(true);
      expect(p.progress).toBe(false);
      expect(p.inbox).toBe(false);
      expect(p.rail).toBe(true);
    }
  });

  it('without the wait, the same row is in Needs you as it always was', () => {
    expect(belongsInInbox(hermes, { now: NOW })).toBe(true);
  });
});

describe('when the wait is over', () => {
  it('a wait whose blockers are all finished is a wait no longer', () => {
    const byId = byIdOf({ ...engine, status: 'done' }, { ...opencode, status: 'done' }, hermes);
    expect(waitsThatCanEnd(hermes, byId)).toEqual([]);
    expect(placed(hermes, byId).inbox).toBe(true);
  });

  it('one finished blocker out of two still waits on the other', () => {
    const byId = byIdOf({ ...engine, status: 'done' }, opencode, hermes);
    expect(waitsThatCanEnd(hermes, byId)).toEqual(['w-opencode']);
    expect(placed(hermes, byId).later).toBe(true);
  });
});

describe('what must not wait in Later', () => {
  it('two threads waiting on each other, which nothing will ever resume', () => {
    const a = row('w-a', { status: 'blocked', blockedBy: ['w-b'], ...parked });
    const b = row('w-b', { status: 'blocked', blockedBy: ['w-a'], ...parked });
    const byId = byIdOf(a, b);
    expect(waitsThatCanEnd(a, byId)).toEqual([]);
    expect(placed(a, byId).inbox).toBe(true);
    expect(placed(b, byId).inbox).toBe(true);
  });

  it('a longer loop, three threads round', () => {
    const a = row('w-a', { status: 'blocked', blockedBy: ['w-b'], ...parked });
    const b = row('w-b', { status: 'blocked', blockedBy: ['w-c'], ...parked });
    const c = row('w-c', { status: 'blocked', blockedBy: ['w-a'], ...parked });
    expect(placed(a, byIdOf(a, b, c)).inbox).toBe(true);
  });

  it('but a loop with a way out still waits, on the way out', () => {
    const a = row('w-a', { status: 'blocked', blockedBy: ['w-b'], ...parked });
    const b = row('w-b', { status: 'blocked', blockedBy: ['w-a', 'w-root'], ...parked });
    const root = row('w-root', { labels: ['founder'] });
    expect(placed(a, byIdOf(a, b, root)).later).toBe(true);
  });

  it('a thread the window cannot see, or a thread naming itself', () => {
    const waiting = row('w-wait', { status: 'blocked', blockedBy: ['w-gone', 'w-wait'], ...parked });
    expect(placed(waiting, byIdOf(waiting)).inbox).toBe(true);
  });

  it('a thread you stopped yourself, which nothing resumes', () => {
    const stopped = { ...hermes, wrote: { status: { ts: NOW, source: 'founder' } } };
    const p = placed(stopped, byIdOf(engine, opencode, stopped));
    expect(p.later).toBe(false);
    expect(p.inbox).toBe(true);
  });

  it('a thread that is not parked: your own open task is still queued, in In progress', () => {
    const yours = row('w-yours', { labels: ['founder'], blockedBy: ['w-engine'] });
    const p = placed(yours, byIdOf(engine, yours));
    expect(p.later).toBe(false);
    expect(p.progress).toBe(true);
  });

  it('a waiting thread a session is on is In progress, because something is running', () => {
    const p = placed(hermes, byIdOf(engine, opencode, hermes), { live: true });
    expect(p.progress).toBe(true);
    expect(p.later).toBe(false);
    expect(p.inbox).toBe(false);
  });
});

describe('a waiting thread is in exactly one list', () => {
  it('whatever the run queue is doing', () => {
    for (const claims of [{}, { live: true }, { shipping: true }]) {
      const p = placed(hermes, byIdOf(engine, opencode, hermes), claims);
      expect([p.inbox, p.progress, p.later].filter(Boolean)).toHaveLength(1);
    }
  });
});
