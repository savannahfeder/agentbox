// RUN NOW STARTS A WAITING TASK AHEAD OF EVERYTHING ELSE.
//
// What broke (w-87ff499077, 2026-10-02): the only way to get a waiting task
// running was to raise its tag to Urgent and lower the others, and that often
// did nothing. Read off main/supervisor.mjs and shared/rank.mjs, three reasons:
//
//   1. A project's place in the running order is worth 100 and a tag 2 to 9,
//      so an Urgent task in a lower project still sorts below a Low one in a
//      higher project, and cannot interrupt it either (strictly lower only).
//   2. Lowering other tasks reorders the waiting line but never stops a task
//      that is already running, and only Urgent may take a running slot.
//   3. Urgent stops interrupting after two empty runs on the row.
//
// So the three-dot menu on a waiting task gets "Run now": a one-time push that
// puts the task at the front whatever its project or tag, and, if every slot
// is full, pauses the least important running task (kept, and resumed as the
// same session afterwards, exactly as an Urgent interruption is). The cases:
// the reported one (a low task in a low project, behind a full fleet), the
// boundary on either side (a free slot; a fleet of pushed tasks), and the case
// that must NOT change (a task nobody pushed still waits).

import { describe, it, expect, beforeEach } from 'vitest';
import { Supervisor } from '../main/supervisor.mjs';

// One Claude login and nothing else, so the machine running the suite cannot
// lend these tests a second account's slots (see an-urgent-task-interrupts...).
const ONE_ACCOUNT_HOME = '/nonexistent-home-with-no-second-account';
const NOW = 1_787_600_000_000;

const store = (items) => ({
  listItems: () => items,
  listProducts: () => [],
  isDue: () => true,
  settleAnswer() {},
});

const hers = (id, priority, extra = {}) => ({
  id, product: 'agentbox', status: 'open', kind: 'directive', labels: ['founder'],
  priority, createdAt: NOW, updatedAt: NOW, claim: null, claimExpired: false, ...extra,
});

let sup; let spawned; let killed; let resumed;

const build = (items, slots = 1, order = []) => {
  sup = new Supervisor(
    { home: ONE_ACCOUNT_HOME, storeRoot: '/nonexistent-zero-root', maxConcurrentSessions: slots, authProfiles: ['default'] },
    store(items),
    '/nonexistent-app',
  );
  sup.productOrder = order;
  spawned = []; killed = []; resumed = [];
  sup.spawnWorker = (item, opts = {}) => {
    spawned.push(item.id);
    if (opts.resumeSessionId) resumed.push({ id: item.id, sessionId: opts.resumeSessionId });
    sup.sessions.set(item.id, { itemId: item.id, product: item.product, startedAt: NOW, tail: [] });
  };
  sup._kill = (session) => {
    killed.push(session.itemId);
    session.stoppedByUs = true;
    sup.sessions.delete(session.itemId);
    return true;
  };
  sup.transcriptFile = (rec) => (rec?.sessionId ? `/transcripts/${rec.sessionId}.jsonl` : null);
  // Nothing in these tests writes the state file.
  sup._saveState = () => {};
  return sup;
};

const running = (id, { product = 'agentbox', startedAt = NOW } = {}) => {
  sup.sessions.set(id, { itemId: id, product, startedAt, tail: [] });
  sup._liveSessions[id] = { sessionId: `s-${id}`, product, cwd: '/tmp', profile: 'default' };
};

beforeEach(() => { build([]); });

describe('run now against a full fleet', () => {
  // The reported case: a Low task in the LOWER project, with the one slot held
  // by an Urgent task in the higher one. Raising the tag could never move it.
  it('pauses the running task to make room, even one in a higher project', async () => {
    build([
      hers('w-top', 9, { product: 'first' }),
      hers('w-mine', 2, { product: 'second' }),
    ], 1, ['first', 'second']);
    running('w-top', { product: 'first' });
    expect(sup.runNow('second', 'w-mine')).toEqual({ ok: true });
    await sup.tick();
    expect(killed).toEqual(['w-top']);
  });

  it('starts on the next tick, in the slot it made', async () => {
    build([hers('w-busy', 5), hers('w-mine', 2)], 1);
    running('w-busy');
    sup.runNow('agentbox', 'w-mine');
    await sup.tick();
    await sup.tick();
    expect(spawned).toEqual(['w-mine']);
  });

  // "Picks up where it left off": the paused task comes back as its own
  // session once the pushed one is running and a slot frees.
  it('resumes the paused task as its own session once a slot frees', async () => {
    build([hers('w-busy', 5), hers('w-mine', 2)], 1);
    running('w-busy');
    sup.runNow('agentbox', 'w-mine');
    await sup.tick();
    await sup.tick();
    sup.sessions.delete('w-mine');
    await sup.tick();
    expect(resumed).toEqual([{ id: 'w-busy', sessionId: 's-w-busy' }]);
  });

  // Of several running tasks, the least important goes, and of a tie the one
  // that started most recently, which is the Urgent rule's own order.
  it('pauses the least important of the running tasks', async () => {
    build([hers('w-high', 7), hers('w-low', 2), hers('w-mine', 2)], 2);
    running('w-high');
    running('w-low');
    sup.runNow('agentbox', 'w-mine');
    await sup.tick();
    expect(killed).toEqual(['w-low']);
  });

  // An Urgent row stops interrupting after two empty runs. Run now is her
  // asking for this row by name, so that rule is not hers to trip over here.
  it('still makes room on a row workers have twice left alone', async () => {
    build([hers('w-busy', 5), hers('w-mine', 2)], 1);
    running('w-busy');
    sup._fruitless['agentbox:w-mine'] = { runs: 2, endedAt: NOW - 86_400_000, founderAt: NOW + 1 };
    sup.runNow('agentbox', 'w-mine');
    await sup.tick();
    expect(killed).toEqual(['w-busy']);
  });
});

describe('run now with room to spare', () => {
  it('pauses nothing when a slot is free', async () => {
    build([hers('w-mine', 2)], 2);
    running('w-other');
    sup.runNow('agentbox', 'w-mine');
    await sup.tick();
    expect(killed).toEqual([]);
    expect(spawned).toEqual(['w-mine']);
  });

  // One free slot and two tasks waiting for it: the pushed one gets it, though
  // the other is Urgent and in the project she ranked first.
  it('takes the free slot ahead of an urgent task in a higher project', async () => {
    build([
      hers('w-top', 9, { product: 'first' }),
      hers('w-mine', 2, { product: 'second' }),
    ], 1, ['first', 'second']);
    sup.runNow('second', 'w-mine');
    await sup.tick();
    expect(spawned).toEqual(['w-mine']);
  });

  // A one-time push, not a new tag: once it is running it is no longer pushed,
  // and the window stops saying so.
  it('is forgotten once the task is running', async () => {
    build([hers('w-mine', 2)], 1);
    sup.runNow('agentbox', 'w-mine');
    expect(sup.status().runNow).toEqual(['w-mine']);
    await sup.tick();
    expect(sup.status().runNow).toEqual([]);
  });
});

describe('what run now leaves alone', () => {
  // The must-not-match case: without the push, a Low row in a full fleet waits,
  // exactly as before.
  it('a task nobody pushed still waits its turn', async () => {
    build([hers('w-busy', 5), hers('w-mine', 2)], 1);
    running('w-busy');
    await sup.tick();
    await sup.tick();
    expect(killed).toEqual([]);
    expect(spawned).toEqual([]);
  });

  // Two pushes on a one-slot fleet must not take turns killing each other,
  // and the first is still one she asked for while it runs.
  it('never pauses another task that was pushed with run now', async () => {
    build([hers('w-first', 2), hers('w-second', 2)], 1);
    sup.runNow('agentbox', 'w-first');
    await sup.tick();
    expect(spawned).toEqual(['w-first']);
    sup.runNow('agentbox', 'w-second');
    await sup.tick();
    await sup.tick();
    expect(killed).toEqual([]);
  });

  // Once the pushed task has finished, the push is over too, so a later push
  // may pause whatever that task's next run is.
  it('lets go of the push when the pushed task stops running', async () => {
    build([hers('w-first', 2)], 1);
    sup.runNow('agentbox', 'w-first');
    await sup.tick();
    sup.sessions.delete('w-first');
    await sup.tick();
    expect(sup._runNow.size).toBe(0);
  });

  it('says so, and changes nothing, for a task already running', () => {
    build([hers('w-busy', 5)], 1);
    running('w-busy');
    expect(sup.runNow('agentbox', 'w-busy')).toEqual({ ok: false, reason: 'running' });
    expect(sup.status().runNow).toEqual([]);
  });

  it('says so for a task that is not in the store', () => {
    build([], 1);
    expect(sup.runNow('agentbox', 'w-gone')).toEqual({ ok: false, reason: 'missing' });
  });
});
