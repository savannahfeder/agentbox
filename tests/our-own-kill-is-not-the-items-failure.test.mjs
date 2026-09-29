// A session WE killed is not the item's failure, and the signal never said so.
//
// `delivery-survives-a-dead-worker.test.mjs` already asserts the rule: a kill of
// ours does not spend a delivery attempt. It asserts it by PASSING 'SIGTERM' as
// the signal, and the exit handler passes through whatever Node hands it. Node
// hands it null. The claude CLI traps SIGTERM and exits with status 143 under
// its own power, so `child.on('exit', (code, signal))` fires with
// `{code: 143, signal: null}` and every kill the app performs is indistinguishable
// from a worker that died on its own. Measured against ~/.local/bin/claude:
//
// child.kill -> {"code":143,"signal":null,"killedBySignal":false}
//
// Two things ride on that null, and both were wrong every time:
//
//   1. The item is charged a delivery attempt. Three of her ordinary actions on
//      one row (archive, snooze, stop, a pause, an app restart, in any mix) and
//      the answer is "given up": the mark stands, no tick ever looks at the row
//      again, and it reads "stopped" forever with nothing retrying.
//   2. A kill inside 45 seconds is counted as a FAST EXIT, which strikes the
//      auth profile and arms a fleet-wide spawn cooldown that doubles to 30
//      minutes. tick returns at its first line while that runs, so nothing
//      spawns at all: no continuations, no fresh work, no digest, no drive. She
//      archived a row five seconds after a worker picked it up (harbour-new,
//      12:37 PT) and stopped her whole fleet.
//
// So intent is recorded where it is known, at the kill, and never inferred from
// a signal the CLI swallows.

import { describe, it, expect, beforeEach } from 'vitest';
import { Supervisor } from '../main/supervisor.mjs';

// A MAC WITH ONE CLAUDE LOGIN ON IT. Since 2026-08-31 the fleet's account list
// is what is signed in on the disk and not only what the config names
// (main/account-discovery.mjs), so a Supervisor built with no `home` reads
// whoever is signed in on the machine running the suite — and a developer with
// a second subscription would silently get twice the capacity these tests are
// about. A home with nothing in it is the machine every one of them means.
const ONE_ACCOUNT_HOME = '/nonexistent-home-with-no-second-account';


const ITEM = {
  id: 'w-46b9af11b8', product: 'harbour-new', answer: 'merge it',
  wrote: { answer: { ts: 1_786_475_838_566, source: 'founder' } },
};
const ANSWER = ITEM.answer;

let sup;
beforeEach(() => {
  sup = new Supervisor(
    { home: ONE_ACCOUNT_HOME, storeRoot: '/nonexistent-zero-root', maxConcurrentSessions: 3, authProfiles: ['default'] },
    { listItems: () => [] },
    '/nonexistent-app',
  );
});

const mark = () => sup._handledAnswers.add(sup._answerKey(ITEM, ANSWER));
const marked = () => sup._answerDelivered(ITEM, ANSWER);

// A session as the exit handler sees one, with a child that records its kill.
const fakeSession = (over = {}) => {
  const session = {
    child: { killed: false, kill() { this.killed = true; } },
    itemId: ITEM.id, product: ITEM.product, startedAt: Date.now(), tail: [], profile: 'default',
    ...over,
  };
  return session;
};

describe('a kill of ours, arriving as the CLI exits itself', () => {
  it('does not spend a delivery attempt, though no signal ever arrives', () => {
    mark();
    const session = fakeSession({ result: null });
    sup.stopSession(ITEM.id); // no session registered; the mark below is the point
    // What the exit handler really receives after child.kill: signal null.
    const verdict = sup.settleDelivery(ITEM, ANSWER, { ...session, stoppedByUs: true }, null);
    expect(verdict).toBe('interrupted');
    expect(marked()).toBe(false);
    expect(sup._deliveryAttempts[sup._answerKey(ITEM, ANSWER)]).toBeUndefined();
  });

  it('never gives up on a row she only ever archived, snoozed and stopped', () => {
    // Three of her own actions on one row. Before this, the third one stranded
    // it permanently: "given up", still marked, invisible to every tick.
    for (let n = 0; n < 3; n += 1) {
      mark();
      expect(sup.settleDelivery(ITEM, ANSWER, { result: null, stoppedByUs: true }, null)).toBe('interrupted');
    }
    expect(marked()).toBe(false);
  });

  it('still gives up after three real failures', () => {
    // The cap is not weakened: a task that cannot succeed must not respawn
    // forever, and three genuine deaths still read as stopped, honestly.
    const dead = { result: 'error_during_execution', resultIsError: true };
    mark(); expect(sup.settleDelivery(ITEM, ANSWER, dead, null)).toBe('retrying');
    mark(); expect(sup.settleDelivery(ITEM, ANSWER, dead, null)).toBe('retrying');
    mark(); expect(sup.settleDelivery(ITEM, ANSWER, dead, null)).toBe('given up');
    expect(marked()).toBe(true);
  });
});

describe('every path that kills a worker says so on the session', () => {
  const register = (over = {}) => {
    const session = fakeSession(over);
    sup.sessions.set(session.itemId, session);
    return session;
  };

  it('marks her stop', () => {
    const session = register();
    expect(sup.stopSession(ITEM.id)).toBe(true);
    expect(session.child.killed).toBe(true);
    expect(session.stoppedByUs).toBe(true);
  });

  it('marks an app quit', () => {
    const session = register();
    sup.killAll();
    expect(session.stoppedByUs).toBe(true);
  });

  // Pausing ONE project was a fourth killer here. It is deleted
  // (w-d19d6d387c, 2026-09-22); pausing the whole fleet is killAll above.

  it('marks a supervisor shutdown', () => {
    const session = register();
    sup.stop();
    expect(session.stoppedByUs).toBe(true);
  });
});

describe('the spawn backoff reads spawn health, not her housekeeping', () => {
  it('does not count a kill of ours as a fast exit', () => {
    // The one that froze the fleet: killed 5 seconds in, so "fast", so a
    // strike on the subscription and a cooldown tick refuses to run through.
    const session = fakeSession({ startedAt: Date.now() - 5_000, stoppedByUs: true });
    sup.noteExitForBackoff(session, { personal: false });
    expect(sup._fastExits ?? 0).toBe(0);
    expect(sup._spawnCooldownUntil ?? 0).toBe(0);
    expect(sup._profileStrikes?.default ?? 0).toBe(0);
  });

  it('still backs off when a spawn dies on its own inside the window', () => {
    const session = fakeSession({ startedAt: Date.now() - 5_000, tail: ['stderr: usage limit reached'] });
    sup.noteExitForBackoff(session, { personal: false });
    expect(sup._fastExits).toBe(1);
    expect(sup._spawnCooldownUntil).toBeGreaterThan(Date.now());
    // The CLI's words are still read and still kept, but as evidence rather
    // than as copy: what they become is a cause, and the sentence for a cause
    // is ours. The raw line stays for the trace log and for anyone debugging,
    // and never reaches a screen.
    expect(sup._lastFastExit?.cause).toBe('at-limit');
    expect(sup._lastFastExit?.raw).toContain('usage limit');
  });

  it('leaves a real streak alone rather than resetting it', () => {
    // A kill carries no information about spawn health in either direction, so
    // it must not clear a cooldown a dying fleet earned.
    sup._fastExits = 3;
    sup._spawnCooldownUntil = Date.now() + 600_000;
    const before = sup._spawnCooldownUntil;
    sup.noteExitForBackoff(fakeSession({ startedAt: Date.now() - 600_000, stoppedByUs: true }), { personal: false });
    expect(sup._fastExits).toBe(3);
    expect(sup._spawnCooldownUntil).toBe(before);
  });
});
