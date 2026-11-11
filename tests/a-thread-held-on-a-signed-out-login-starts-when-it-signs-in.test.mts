// A THREAD HELD ON A SIGNED-OUT LOGIN STARTS WHEN THE LOGIN SIGNS BACK IN.
//
// What broke (2026-11-01, w-03beed6d40): the one Claude login on the Mac was
// refused for about three hours ("OAuth session expired and could not be
// refreshed"). One thread's starts died six times in ten minutes, so the app
// held it for 30 minutes. The login was signed back in. The other waiting
// threads started 14 seconds later, and the held one still read "Signed out"
// and waited out its 30 minutes: the hold only knew its clock.
//
// Measured on the real store: two threads waiting on the login restarted at
// 19:49:07, and the held one's next try was still 20:02:26. Here the hold is
// built from six refused starts, and a sign-in is written to the login's file.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';

const T0 = Date.parse('2026-11-01T05:30:00Z');
const MIN = 60_000;
const HOUR = 60 * MIN;
const REFUSED = 'Failed to authenticate: OAuth session expired and could not be refreshed';
const realNow = Date.now;
let now; let root; let items; let started;

const row = (id) => ({
  id, product: 'p', title: id, kind: 'task', status: 'open', labels: ['founder'],
  answer: 'Go on.', wrote: { answer: { ts: T0 - HOUR, source: 'founder' } },
});

function supervisor() {
  const sup = new Supervisor(
    { storeRoot: root, home: root, maxConcurrentSessions: 3, authProfiles: ['default'] },
    {
      listItems: () => items, listProducts: () => [], isDue: (i, at) => !(i.runAt > at),
      recordSessionResult: (product, id, patch) => {
        const it = items.find((i) => i.id === id);
        if (it && patch.status) it.status = patch.status;
      },
      answerItem: (product, id, patch) => {
        const it = items.find((i) => i.id === id);
        if (it && patch.status) it.status = patch.status;
        return it;
      },
    },
    root, root, root,
  );
  // Past the hold, the door's next question. Answering yes stops the run
  // there, so the test counts the starts without making one.
  sup._compactionJobs = { has: (key) => { started.push(JSON.parse(key)[1]); return true; } };
  sup.tick = async () => {};
  sup.wake = () => {};
  return sup;
}

const refusedStart = () => ({
  engine: 'claude', profile: 'default', startedAt: now - 800,
  sessionId: null, result: REFUSED, resultIsError: true, tail: [],
});

// A start that died before the agent began, for a reason that is not the login.
const cloudDeadStart = () => ({
  engine: 'claude', profile: 'default', startedAt: now - 800, sessionId: null, result: null,
  tail: ['stderr: agentbox cloud: no Claude account is signed in for the cloud yet (the cloud button)'],
});

function holdIt(sup, start) {
  for (let i = 0; i < 6; i += 1) {
    now += 15_000;
    const session = start();
    sup._noteHowTheRunStarted(items[0], session);
    if (session.result) sup._noteProfileTrouble('default', session.result);
  }
  expect(sup._heldFromStarting(items[0])).toBe(true);
}

// Claude Code rewrites the login's file when somebody signs in.
function signIn() {
  const file = path.join(root, '.claude.json');
  fs.writeFileSync(file, '{"oauthAccount":{"accountUuid":"u"}}');
  const t = new Date(realNow() + HOUR);
  fs.utimesSync(file, t, t);
}

// The two steps of `_tick` this is about, in its order, and the start that follows.
function tickAt(sup, at, { dies = true } = {}) {
  now = at;
  const before = started.length;
  sup._noticeSignIns();
  sup.retryHeldThreads(items, now);
  sup._drainResumeQueue(items);
  if (started.length > before) {
    now += 800;
    const session = dies ? refusedStart() : { ...refusedStart(), sessionId: 'abc', result: null, resultIsError: false, startedAt: now - 60_000 };
    sup._noteHowTheRunStarted(items[0], session);
    if (dies) sup._noteProfileTrouble('default', session.result);
  }
  return started.length - before;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'held-signed-out-'));
  fs.writeFileSync(path.join(root, '.claude.json'), '{}');
  const old = new Date(realNow() - HOUR);
  fs.utimesSync(path.join(root, '.claude.json'), old, old);
  now = T0;
  Date.now = () => now;
  items = [row('w-held')];
  started = [];
});
afterEach(() => { Date.now = realNow; });

describe('a thread held because its login was signed out', () => {
  it('starts on the next tick after the login signs back in, not 30 minutes later', () => {
    const sup = supervisor();
    holdIt(sup, refusedStart);
    expect(tickAt(sup, now + MIN)).toBe(0);
    signIn();
    expect(tickAt(sup, now + MIN, { dies: false })).toBe(1);
    expect(sup._heldFromStarting(items[0])).toBe(false);
  });

  // THE CASE THAT MUST NOT MATCH: nothing was signed in, so the hold keeps its clock.
  it('waits out its 30 minutes when nobody signs in', () => {
    const sup = supervisor();
    holdIt(sup, refusedStart);
    const heldAt = now;
    expect(tickAt(sup, heldAt + 29 * MIN)).toBe(0);
    expect(tickAt(sup, heldAt + 30 * MIN)).toBe(1);
  });

  it('gets one try per sign-in, and a try that dies goes back on the clock', () => {
    const sup = supervisor();
    holdIt(sup, refusedStart);
    signIn();
    expect(tickAt(sup, now + MIN)).toBe(1);
    let more = 0;
    for (let i = 0; i < 20; i += 1) more += tickAt(sup, now + MIN);
    expect(more).toBe(0);
    expect(sup._heldFromStarting(items[0])).toBe(true);
  });
});

describe('a thread held for another reason', () => {
  it('is not started by a sign-in', () => {
    const sup = supervisor();
    holdIt(sup, cloudDeadStart);
    sup._noteProfileTrouble('default', REFUSED);
    signIn();
    expect(tickAt(sup, now + MIN)).toBe(0);
    expect(sup._heldFromStarting(items[0])).toBe(true);
  });
});
