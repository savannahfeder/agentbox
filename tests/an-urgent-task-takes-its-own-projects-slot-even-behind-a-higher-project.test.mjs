// AN URGENT TASK SAT FOR 49 MINUTES WHILE A MEDIUM ONE IN ITS OWN PROJECT RAN.
//
// What broke (2026-10-04, w-53a72e6e7f): her running order put Agentbox Team
// above Astral Video. Astral Video had an Urgent task waiting and a Medium one
// running; Agentbox Team had several Medium tasks waiting. Measured from the
// session logs: in the hour the Urgent task waited, the app started 20
// Agentbox Team sessions and one Astral Video session, and that one was the
// Medium task.
//
// Two faults in the tick, both reproduced below before the fix:
//
// 1. One interruption is allowed per engine per tick, and the allowance was
//    spent on the FIRST row in the queue that did not fit, whether or not
//    that row could interrupt anything. A waiting Agentbox Team Medium sorts
//    above an Astral Video Urgent (project order is worth 100, a tag 0..9),
//    cannot interrupt, and used the allowance up. The Urgent row below it
//    never got to ask.
// 2. Even when the Urgent row did interrupt, the slot it freed went to the
//    top of the queue on the next tick, which was the Agentbox Team row. The
//    Medium was paused for nothing and the Urgent row went on waiting.
//
// What must NOT change: the Urgent row may still only pause something that
// scores below it, so an Agentbox Team task is never paused for an Astral
// Video one, and with nothing it may pause, the higher project's work still
// gets the next free slot first.

import { describe, it, expect } from 'vitest';
import { Supervisor } from '../main/supervisor.mjs';

const ONE_ACCOUNT_HOME = '/nonexistent-home-with-no-second-account';
const NOW = 1_787_600_000_000;

const store = (items) => ({
  listItems: () => items,
  listProducts: () => [],
  isDue: () => true,
  settleAnswer() {},
});

const hers = (id, product, priority, extra = {}) => ({
  id, product, status: 'open', kind: 'directive', labels: ['founder'],
  priority, createdAt: NOW, updatedAt: NOW, claim: null, claimExpired: false, ...extra,
});

let sup; let spawned; let killed;

const build = (items, slots) => {
  sup = new Supervisor(
    { home: ONE_ACCOUNT_HOME, storeRoot: '/nonexistent-zero-root', maxConcurrentSessions: slots, authProfiles: ['default'] },
    store(items),
    '/nonexistent-app',
  );
  sup.productOrder = ['team', 'video'];
  spawned = []; killed = [];
  sup.spawnWorker = (item) => {
    spawned.push(item.id);
    sup.sessions.set(item.id, { itemId: item.id, product: item.product, startedAt: NOW });
  };
  sup._kill = (session) => {
    killed.push(session.itemId);
    session.stoppedByUs = true;
    sup.sessions.delete(session.itemId);
    return true;
  };
  sup.transcriptFile = (rec) => (rec?.sessionId ? `/transcripts/${rec.sessionId}.jsonl` : null);
  return sup;
};

const running = (id, product, startedAt = NOW) => {
  sup.sessions.set(id, { itemId: id, product, startedAt });
  sup._liveSessions[id] = { sessionId: `s-${id}`, product, cwd: '/tmp', profile: 'default' };
};

// A task that finishes on its own: its session ends and the row is done, so
// nothing is left to resume and its slot is simply free.
const finish = (items, id) => {
  sup.sessions.delete(id);
  delete sup._liveSessions[id];
  items.find((i) => i.id === id).status = 'done';
};

// The screenshot at its smallest: two slots, one running a higher project's
// task, one running the Medium of the Urgent task's own project, and a higher
// project's Medium waiting in line above the Urgent one.
const screenshot = () => [
  hers('w-team-running', 'team', 5),
  hers('w-team-waiting', 'team', 5),
  hers('w-video-medium', 'video', 5),
  hers('w-video-urgent', 'video', 9),
];

describe('an urgent task behind a higher project in the queue', () => {
  it('pauses the medium task in its own project', async () => {
    build(screenshot(), 2);
    running('w-team-running', 'team');
    running('w-video-medium', 'video');
    await sup.tick();
    expect(killed).toEqual(['w-video-medium']);
  });

  it('starts in the slot it freed, ahead of the higher project waiting above it', async () => {
    build(screenshot(), 2);
    running('w-team-running', 'team');
    running('w-video-medium', 'video');
    await sup.tick();
    await sup.tick();
    expect(spawned).toEqual(['w-video-urgent']);
  });

  // The paused Medium is given back before anything new starts, which is the
  // existing promise of a pause. The higher project loses nothing by it: that
  // Medium held this slot before the Urgent task ever asked.
  it('gives the next slot back to the task it paused, then the higher project', async () => {
    const items = screenshot();
    build(items, 2);
    running('w-team-running', 'team');
    running('w-video-medium', 'video');
    await sup.tick();
    await sup.tick();
    finish(items, 'w-team-running');
    await sup.tick();
    expect(spawned).toEqual(['w-video-urgent', 'w-video-medium']);
    finish(items, 'w-video-urgent');
    await sup.tick();
    expect(spawned).toEqual(['w-video-urgent', 'w-video-medium', 'w-team-waiting']);
  });
});

describe('what it still may not do', () => {
  // Project order still dominates: an Astral Video Urgent scores below any
  // Agentbox Team task, so it never pauses one.
  it('never pauses a higher project task', async () => {
    build([
      hers('w-team-running', 'team', 2),
      hers('w-team-waiting', 'team', 5),
      hers('w-video-urgent', 'video', 9),
    ], 1);
    running('w-team-running', 'team');
    await sup.tick();
    expect(killed).toEqual([]);
  });

  // With nothing it may pause, a slot that frees on its own goes to the
  // higher project's waiting task first, exactly as before.
  it('waits behind the higher project when a slot frees on its own', async () => {
    const items = [
      hers('w-team-running', 'team', 5),
      hers('w-team-waiting', 'team', 5),
      hers('w-video-urgent', 'video', 9),
    ];
    build(items, 1);
    running('w-team-running', 'team');
    await sup.tick();
    finish(items, 'w-team-running');
    await sup.tick();
    expect(spawned).toEqual(['w-team-waiting']);
  });

  // Still one pause per engine per tick, however many rows could ask.
  it('pauses at most one session in a tick', async () => {
    build([
      hers('w-team-waiting', 'team', 5),
      hers('w-video-m1', 'video', 5),
      hers('w-video-m2', 'video', 5),
      hers('w-video-u1', 'video', 9),
      hers('w-video-u2', 'video', 9),
    ], 2);
    running('w-video-m1', 'video');
    running('w-video-m2', 'video');
    await sup.tick();
    expect(killed).toHaveLength(1);
  });
});
