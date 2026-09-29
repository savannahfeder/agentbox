// AN URGENT ROW TAKES A SLOT. IT USED TO WAIT FOR ONE.
//
// had already fixed the ORDER: one scored queue, so an Urgent row is first in
// line. First in line is not the same as running, because the line only moves
// when a session ends on its own. Measured across her whole store for the five
// days after that fix landed (08-19 19:37 to 08-24): 68 answers on Urgent
// rows, 23 of them waited longer than five minutes to start, and 17 of those
// had a lower-priority session running at the moment they finally did. In the
// 19 clearest cases her urgent work spent 7.8 hours waiting behind sessions
// that ran a median of 21 minutes. The worst single wait was 61.5 minutes.
//
// The whole safety of this is the word KEPT in her sentence, so most of what
// is tested below is not "does it interrupt" but "does the interrupted work
// come back, and is it the same session that comes back".

import { describe, it, expect, beforeEach } from 'vitest';
import { Supervisor } from '../main/supervisor.mjs';

// A MAC WITH ONE CLAUDE LOGIN ON IT. Since 2026-08-31 the fleet's account list
// is what is signed in on the disk and not only what the config names
// (main/account-discovery.mjs), so a Supervisor built with no `home` reads
// whoever is signed in on the machine running the suite — and a developer with
// a second subscription would silently get twice the capacity these tests are
// about. A home with nothing in it is the machine every one of them means.
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

const answered = (id, priority, extra = {}) => ({
  id, product: 'agentbox', status: 'open', kind: 'question', labels: [],
  priority, answer: 'approved', createdAt: NOW - 60_000, updatedAt: NOW - 60_000,
  claim: null, claimExpired: false,
  wrote: { answer: { ts: NOW - 60_000, source: 'founder' } },
  ...extra,
});

let sup; let spawned; let killed; let resumed;

const build = (items, slots = 1) => {
  sup = new Supervisor(
    { home: ONE_ACCOUNT_HOME, storeRoot: '/nonexistent-zero-root', maxConcurrentSessions: slots, authProfiles: ['default'] },
    store(items),
    '/nonexistent-app',
  );
  spawned = []; killed = []; resumed = [];
  sup.spawnWorker = (item, opts = {}) => {
    spawned.push(item.id);
    if (opts.resumeSessionId) resumed.push({ id: item.id, sessionId: opts.resumeSessionId });
    sup.sessions.set(item.id, { itemId: item.id, product: item.product, startedAt: NOW });
  };
  // The real _kill signals a child and waits for an exit. Here it does what
  // the exit handler would do: the session leaves the running map, and the
  // memory of it deliberately STAYS, which is what a resume is made of.
  sup._kill = (session) => {
    killed.push(session.itemId);
    session.stoppedByUs = true;
    sup.sessions.delete(session.itemId);
    return true;
  };
  // A session id and a transcript on disk are the two things that make a row
  // resumable, and _preemptFor refuses to touch a row without both.
  sup.transcriptFile = (rec) => (rec?.sessionId ? `/transcripts/${rec.sessionId}.jsonl` : null);
  return sup;
};

/** Put a running session on the fleet, as if a worker were mid-task on it. */
const running = (id, { product = 'agentbox', startedAt = NOW, session = `s-${id}` } = {}) => {
  sup.sessions.set(id, { itemId: id, product, startedAt });
  if (session) sup._liveSessions[id] = { sessionId: session, product, cwd: '/tmp', profile: 'default' };
};

beforeEach(() => { build([]); });

describe('an urgent row against a full fleet', () => {
  // The screenshot, at the smallest size that shows it: every slot taken by a
  // Medium, and her Urgent row queued behind it.
  it('interrupts the medium session instead of queueing behind it', async () => {
    build([hers('w-medium', 5), hers('w-urgent', 9)], 1);
    running('w-medium');
    await sup.tick();
    expect(killed).toEqual(['w-medium']);
  });

  // "the work is kept". The kill leaves the session id behind on purpose, and
  // that is the whole difference between interrupting work and losing it.
  it('keeps the interrupted session so it can be resumed', async () => {
    build([hers('w-medium', 5), hers('w-urgent', 9)], 1);
    running('w-medium');
    await sup.tick();
    expect(sup._liveSessions['w-medium']?.sessionId).toBe('s-w-medium');
  });

  // The child has to exit before its slot is real, so the urgent row spawns
  // on the tick after the one that freed it.
  it('gives the freed slot to the urgent row on the next tick', async () => {
    build([hers('w-medium', 5), hers('w-urgent', 9)], 1);
    running('w-medium');
    await sup.tick();
    expect(spawned).toEqual([]);
    await sup.tick();
    expect(spawned).toEqual(['w-urgent']);
  });

  // The failure this whole hold exists to prevent. The wake sweep sees a row
  // whose session is on disk and not running and wants to resume it; if it
  // does, the slot we just made goes straight back to the row we took it from
  // and her urgent row is exactly where it started, one session poorer.
  it('does not hand the freed slot straight back to the row it took it from', async () => {
    build([hers('w-medium', 5), hers('w-urgent', 9)], 1);
    running('w-medium');
    await sup.tick();
    await sup.tick();
    expect(spawned).toEqual(['w-urgent']);
    expect(resumed).toEqual([]);
  });

  // The second half of the promise: once the urgent row IS running, the row we
  // interrupted goes back into the queue, and it goes back as the SAME claude
  // session rather than a stranger briefed from zero. That is her rule from
  // the sleep work — resume, never restart — and it has to survive this.
  it('resumes the interrupted row, as its own session, once a slot frees', async () => {
    build([hers('w-medium', 5), hers('w-urgent', 9)], 1);
    running('w-medium');
    await sup.tick();
    await sup.tick();
    expect(spawned).toEqual(['w-urgent']);
    // The urgent row finishes and its slot comes free.
    sup.sessions.delete('w-urgent');
    await sup.tick();
    expect(resumed).toEqual([{ id: 'w-medium', sessionId: 's-w-medium' }]);
  });

  // A slot she already has free is not an interruption at all. Nothing may be
  // killed when queueing was never the problem.
  it('interrupts nothing when a slot is already free', async () => {
    build([hers('w-medium', 5), hers('w-urgent', 9)], 2);
    running('w-medium');
    await sup.tick();
    expect(killed).toEqual([]);
    expect(spawned).toEqual(['w-urgent']);
  });
});

describe('what an urgent row may not take', () => {
  // Urgent is the only level that interrupts. High is still a queue.
  it('does not interrupt for a high row', async () => {
    build([hers('w-medium', 5), hers('w-high', 7)], 1);
    running('w-medium');
    await sup.tick();
    expect(killed).toEqual([]);
  });

  // Equal scores must not interrupt each other, or two urgent rows in one
  // product take turns killing each other for as long as they both exist.
  it('does not interrupt another urgent row', async () => {
    build([hers('w-urgent-a', 9), hers('w-urgent-b', 9)], 1);
    running('w-urgent-a');
    await sup.tick();
    expect(killed).toEqual([]);
  });

  // An agent cannot promote its own proposal into something that takes a
  // running session away from her work. itemPriority already discards an
  // agent's number; this is that rule reaching all the way through.
  it('ignores a nine an agent wrote on its own item', async () => {
    build([
      hers('w-medium', 5),
      hers('w-agent-nine', 9, { labels: ['founder'], wrote: { priority: { ts: NOW, source: 'agent' } } }),
    ], 1);
    running('w-medium');
    await sup.tick();
    expect(killed).toEqual([]);
  });

  // A session whose id has not reached us yet cannot be resumed, so killing it
  // would not be interrupting the work, it would be throwing it away.
  it('leaves a session it could not resume alone', async () => {
    build([hers('w-medium', 5), hers('w-urgent', 9)], 1);
    running('w-medium', { session: null });
    await sup.tick();
    expect(killed).toEqual([]);
  });

  // Same test, from the other side: the id is remembered but the transcript is
  // gone off disk, which is the case --resume dies in a second on.
  it('leaves a session whose transcript is gone alone', async () => {
    build([hers('w-medium', 5), hers('w-urgent', 9)], 1);
    running('w-medium');
    sup.transcriptFile = () => null;
    await sup.tick();
    expect(killed).toEqual([]);
  });

  // A personal thread is not recovered by the wake sweep at all: it keeps its
  // own session memory and the sweep deletes the record rather than resuming.
  it('leaves a personal session alone', async () => {
    build([hers('w-medium', 5), hers('w-urgent', 9)], 1);
    sup.config.personalProducts = ['personal'];
    sup.sessions.clear();
    running('w-medium', { product: 'personal' });
    await sup.tick();
    expect(killed).toEqual([]);
  });

  // Only one session per tick. A burst of urgent rows must not empty the fleet
  // in one pass and leave nothing running at all.
  it('interrupts at most one session in a tick', async () => {
    build([hers('w-m1', 5), hers('w-m2', 5), hers('w-u1', 9), hers('w-u2', 9)], 2);
    running('w-m1'); running('w-m2');
    await sup.tick();
    expect(killed).toHaveLength(1);
  });

  // It takes the cheapest session it can: the lowest priority first.
  it('takes the lowest-priority session of the ones it could take', async () => {
    build([hers('w-low', 2), hers('w-medium', 5), hers('w-urgent', 9)], 2);
    running('w-low'); running('w-medium');
    await sup.tick();
    expect(killed).toEqual(['w-low']);
  });

  // Age is the only thing we know about how much work is in flight, so a tie
  // on priority goes to the session that has least of it.
  it('takes the youngest of two equal sessions', async () => {
    build([hers('w-old', 5), hers('w-young', 5), hers('w-urgent', 9)], 2);
    running('w-old', { startedAt: NOW - 20 * 60_000 });
    running('w-young', { startedAt: NOW - 60_000 });
    await sup.tick();
    expect(killed).toEqual(['w-young']);
  });

  // A kill for a row that was never going to spawn buys her nothing. An answer
  // already delivered is the commonest of those.
  it('does not interrupt for an urgent row whose answer is already delivered', async () => {
    const urgent = answered('w-urgent', 9);
    build([hers('w-medium', 5), urgent], 1);
    running('w-medium');
    sup._handledAnswers.add(sup._answerKey(urgent));
    await sup.tick();
    expect(killed).toEqual([]);
  });

  // Same reasoning: a row still leased to somebody else would refuse the claim.
  it('does not interrupt for an urgent row whose claim is held elsewhere', async () => {
    build([
      hers('w-medium', 5),
      hers('w-urgent', 9, { claim: { holder: 'someone-else' }, claimExpired: false }),
    ], 1);
    running('w-medium');
    await sup.tick();
    expect(killed).toEqual([]);
  });
});

describe('the hold on an interrupted row lets go', () => {
  // The backstop. An urgent row that can never spawn must not park the row it
  // displaced for the rest of the day.
  it('releases the row after the hold expires even if the urgent row never ran', async () => {
    build([hers('w-medium', 5), hers('w-urgent', 9)], 1);
    running('w-medium');
    await sup.tick();
    expect(sup._preempted.has('w-medium')).toBe(true);
    // Sixteen minutes later, with the urgent row still unspawned.
    sup._preempted.get('w-medium').at = Date.now() - 16 * 60_000;
    sup._settlePreemptions([hers('w-medium', 5), hers('w-urgent', 9)]);
    expect(sup._preempted.has('w-medium')).toBe(false);
  });

  // She archives or answers the urgent row instead. It is no longer waiting,
  // so nothing is being held for it.
  it('releases the row when the urgent row is finished', async () => {
    build([hers('w-medium', 5), hers('w-urgent', 9)], 1);
    running('w-medium');
    await sup.tick();
    sup._settlePreemptions([hers('w-medium', 5), hers('w-urgent', 9, { status: 'done' })]);
    expect(sup._preempted.has('w-medium')).toBe(false);
  });

  // She drops it from Urgent to Medium. It no longer earns anybody's slot.
  it('releases the row when she takes the urgent tag off', async () => {
    build([hers('w-medium', 5), hers('w-urgent', 9)], 1);
    running('w-medium');
    await sup.tick();
    sup._settlePreemptions([hers('w-medium', 5), hers('w-urgent', 5)]);
    expect(sup._preempted.has('w-medium')).toBe(false);
  });
});
