// WHO HAS THE NEXT MOVE, ASKED ONCE (w-fe48447cab).
//
// Needs you used to be guessed from a thread's history: an agent spoke after
// you, so it must be your turn. Every wrong guess was patched with its own
// branch in list-rules.ts, and there were about a dozen of them. The two most
// recent were a live session (w-bc976fd247) and the app's own ship queue
// (w-0c1ba766eb), and both had to be told to the inbox from outside, because
// nothing in the row says them.
//
// So the question is asked once now, of every holder in turn, and the lists
// read the answer: Needs you is `nextMove === 'you'`, In progress is an agent,
// the app or another thread, Scheduled is the clock.
//
// WHAT THIS MEASURED, 2026-10-08, and it is the reason the redesign was asked
// for. Every thread in the real store was placed twice, once by the shipped
// rules read out of origin/main and once by this one — 1,632 project ledgers,
// 5,459 threads, each folded exactly as the window folds it:
//
//   TWO threads change list. Both go Needs you -> In progress, and both for
//   the same reason: they wait on a thread that is still alive, and no list in
//   this app had ever read `blockedBy`.
//   ZERO threads land in two lists at once.
//   ZERO threads that were in a list end up in none.
//
//   13 threads carry `blockedBy` at all. 7 wait on a thread already finished,
//   which is not a wait. Of the 6 that wait on a live one, 4 were already in
//   Scheduled because the owner had put them away, and the clock outranks the
//   wait — so 2 move, which is the 2 above.
//
// The guards below the blocked case are what keep that safe: a blocker that is
// finished, a blocker the window cannot see, and a thread naming itself all
// hand the thread straight back to you. Nothing may disappear into a wait.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hiddenUntil, nextMove, stillWaitingOn } from '../renderer/src/next-move.ts';
import { belongsInInbox, belongsInProgress, belongsOnTheRail } from '../renderer/src/list-rules.ts';
import { liveLine, shortWord } from '../renderer/src/live-line.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOW = 1_760_000_000_000;

// A thread you wrote, open, with a worker owed to it: In progress today, and
// the base every case below changes one thing about.
const yours = (over = {}) => ({
  id: 'w-aaa', status: 'open', kind: 'task', labels: ['founder'],
  createdAt: NOW - 60_000, updatedAt: NOW - 60_000, ...over,
});

// A thread an agent has answered and left open, which is Needs you today: the
// shape every `blockedBy` row in the real store actually had.
const handedBack = (over = {}) => yours({
  status: 'blocked', result: 'I need the schema decision first.',
  wrote: { body: { ts: NOW - 60_000, source: 'founder' }, result: { ts: NOW - 30_000, source: 'agent' } },
  ...over,
});

const move = (i, claims = {}) => nextMove(i, { now: NOW, ...claims });

describe('every holder gets asked, and the answer is one word', () => {
  it('says an agent when a session is on it', () => {
    expect(move(yours(), { live: true })).toBe('agent');
  });

  it('says the app while the ship queue still owes it a ship', () => {
    expect(move(yours(), { shipping: true })).toBe('app');
  });

  it('says the clock while you have put it away', () => {
    // `hiddenUntil` is a claim the caller works out, because only the window
    // knows about the old localStorage snooze it still honours on read. The
    // helper is the same one every list passes through.
    const put = yours({ runAt: NOW + 60_000, wrote: { runAt: { ts: NOW, source: 'founder' } } });
    expect(move(put, { hiddenUntil: hiddenUntil(put) })).toBe('clock');
    expect(move(put, { hiddenUntil: hiddenUntil(put), now: NOW + 61_000 })).toBe('agent');
  });

  it('says you when an agent parked it, because the agent said it is not coming back', () => {
    expect(move(yours({ runAt: NOW + 60_000, wrote: { runAt: { ts: NOW, source: 'agent' } } }))).toBe('you');
  });

  it('says later on a thread written down and not begun', () => {
    expect(move(yours({ start: 'later' }))).toBe('later');
  });

  it('says an agent when the run queue says a worker is coming', () => {
    // An agent-filed task on a project you have made autonomous: the
    // supervisor will spawn on it, and the reading of the row hands it to you
    // as a proposal. The queue is the holder, so the queue is right.
    const agentFiled = { id: 'w-bbb', status: 'open', kind: 'task', labels: [], createdAt: NOW };
    expect(move(agentFiled)).toBe('you');
    expect(move(agentFiled, { queued: true })).toBe('agent');
  });

  it('keeps the row its own floor, so a quiet queue loses nothing', () => {
    // `queued` sits UNDER the reading of the row, never over it: a queue that
    // pauses or restarts must not take a worker off a row that promises one.
    expect(move(yours(), { queued: false })).toBe('agent');
    // And it never overrules a holder above it, nor hides what is yours.
    expect(move(handedBack(), { queued: true })).toBe('you');
    expect(move(yours({ start: 'later' }), { queued: true })).toBe('later');
  });

  it('says you when nothing claims it at all', () => {
    // The default, and the whole safety of this: an unclaimed thread is yours,
    // so nothing can quietly disappear out of every list.
    expect(move({ id: 'w-zzz', status: 'blocked' })).toBe('you');
  });
});

/* ------------------- the case the inbox had never read ------------------- */
describe('a thread waiting on another thread is not Needs you', () => {
  it('belongs to that other thread while it is still open', () => {
    const i = handedBack({ blockedBy: ['w-other'] });
    expect(move(i, { waitingOn: ['w-other'] })).toBe('thread');
    expect(belongsInInbox(i, { now: NOW, waitingOn: ['w-other'] })).toBe(false);
    expect(belongsInProgress(i, { now: NOW, waitingOn: ['w-other'] })).toBe(true);
  });

  it('is still somewhere you can reach it', () => {
    // Out of Needs you is only safe because the rail still carries it: the
    // failure this file guards is a row in no list at all.
    const i = handedBack({ blockedBy: ['w-other'] });
    expect(belongsOnTheRail(i, { now: NOW, waitingOn: ['w-other'] })).toBe(true);
  });

  it('comes back to you the moment that thread is finished', () => {
    const i = handedBack({ blockedBy: ['w-other'] });
    expect(move(i, { waitingOn: [] })).toBe('you');
    expect(belongsInInbox(i, { now: NOW, waitingOn: [] })).toBe(true);
  });

  it('stays yours when the thread it names cannot be seen', () => {
    // A blocker in another project, archived, or scrolled out of the window's
    // 8 MB read. `stillWaitingOn` is what refuses to hide one, and it fails
    // open by construction, exactly as `isCleanRun` does.
    const i = handedBack({ blockedBy: ['w-gone'] });
    expect(stillWaitingOn(i, new Map())).toEqual([]);
    expect(move(i, { waitingOn: stillWaitingOn(i, new Map()) })).toBe('you');
  });

  it('does not wait on a thread that is done, or on an empty list', () => {
    const done = new Map([['w-other', { id: 'w-other', status: 'done' }]]);
    expect(stillWaitingOn(handedBack({ blockedBy: ['w-other'] }), done)).toEqual([]);
    expect(stillWaitingOn(handedBack({ blockedBy: [] }), new Map())).toEqual([]);
    expect(stillWaitingOn(handedBack(), new Map())).toEqual([]);
  });

  it('waits on one that is open, claimed or blocked, and names only those', () => {
    const seen = new Map([
      ['w-open', { id: 'w-open', status: 'open' }],
      ['w-claimed', { id: 'w-claimed', status: 'claimed' }],
      ['w-blocked', { id: 'w-blocked', status: 'blocked' }],
      ['w-done', { id: 'w-done', status: 'done' }],
    ]);
    const i = handedBack({ blockedBy: ['w-open', 'w-claimed', 'w-blocked', 'w-done', 'w-gone'] });
    expect(stillWaitingOn(i, seen)).toEqual(['w-open', 'w-claimed', 'w-blocked']);
  });

  it('never waits on itself', () => {
    // A thread naming itself is corrupt data, not a reason to hide it forever.
    const me = handedBack({ id: 'w-aaa', blockedBy: ['w-aaa'] });
    expect(stillWaitingOn(me, new Map([['w-aaa', me]]))).toEqual([]);
  });

  it('is beaten by a session on the row, because that is the nearer fact', () => {
    // An agent working on this thread right now outranks what it waits on: the
    // order of the holders is what stops two of them both being believed.
    const i = handedBack({ blockedBy: ['w-other'] });
    expect(move(i, { waitingOn: ['w-other'], live: true })).toBe('agent');
  });
});

/* ------------------------ and the row says the wait ---------------------- */
// A ROW IN In progress HAS TO SAY WHY IT IS THERE. Without this the thread
// landed in In progress and the line under it read "No agent is on this, and
// none is waiting to start" — true, and the exact sentence this whole redesign
// exists to replace, because it is a row admitting nothing is happening while
// the app knows precisely what it is waiting for.
describe('a thread waiting on another one says so', () => {
  const waiting = handedBack({ blockedBy: ['w-other'] });

  it('names the wait instead of saying nothing is running', () => {
    const line = liveLine(waiting, { inProgress: true, waitingOn: ['w-other'], now: NOW });
    expect(line.state).toBe('waiting');
    expect(line.line).toMatch(/another thread/i);
    expect(shortWord('waiting')).toBe('Waiting');
  });

  it('never says it on a thread that waits on nothing', () => {
    const line = liveLine(handedBack(), { inProgress: true, waitingOn: [], now: NOW });
    expect(line.state).not.toBe('waiting');
  });

  it('is beaten by a session, which is the nearer fact again', () => {
    const line = liveLine(waiting, {
      inProgress: true, waitingOn: ['w-other'], now: NOW,
      session: { itemId: 'w-aaa', startedAt: NOW - 120_000, tail: [] },
    });
    expect(line.state).toBe('working');
  });

  it('is beaten by the app shipping it, for the same reason', () => {
    const line = liveLine(waiting, { inProgress: true, waitingOn: ['w-other'], shipping: true, now: NOW });
    expect(line.state).toBe('shipping');
  });

  it('says it on the row in both the list and the table', () => {
    // Three surfaces draw a row's state and all three had to learn the word,
    // or the thread arrives in In progress saying nothing about why. The table
    // row is the one the Inbox actually draws on this Mac.
    const list = fs.readFileSync(path.join(root, 'renderer', 'src', 'components', 'List.tsx'), 'utf8');
    expect(list).toMatch(/waitingOnThread\?\.includes\(item\.id\)/);
    const pages = fs.readFileSync(path.join(root, 'renderer', 'src', 'threads', 'Pages.tsx'), 'utf8');
    expect(pages).toMatch(/waitingOnThread && <span className="th-aside">waiting<\/span>/);
    expect(pages).toMatch(/WaitingOnThreadContext/);
    const app = fs.readFileSync(path.join(root, 'renderer', 'src', 'App.tsx'), 'utf8');
    expect(app).toMatch(/WaitingOnThreadContext\.Provider/);
  });
});

/* ------------------------- and it is ONE place --------------------------- */
describe('the lists read the one answer and keep no copy of it', () => {
  const rules = fs.readFileSync(path.join(root, 'renderer', 'src', 'list-rules.ts'), 'utf8');

  it('derives all four lists from nextMove', () => {
    for (const fn of ['belongsInInbox', 'belongsInProgress', 'belongsOnTheRail', 'stoppable']) {
      const body = rules.slice(rules.indexOf(`export function ${fn}`));
      expect(body.slice(0, body.indexOf('\n}\n'))).toMatch(/nextMove|belongsIn|whoseMove/);
    }
  });

  it('leaves no second answer behind in the list file', () => {
    // Every branch that used to guess lives in next-move.ts now. If one of
    // these words comes back here, the fact has two homes again.
    const lists = rules.slice(rules.indexOf('export function belongsInInbox'), rules.indexOf('/* ------------------------- what an agent proposes'));
    expect(lists).not.toMatch(/answerSettled|answeredHerAsk|isCleanRun|parkedByAgent/);
  });

  it('asks the window to pass what only the window can see', () => {
    const app = fs.readFileSync(path.join(root, 'renderer', 'src', 'App.tsx'), 'utf8');
    // live, shipping and waitingOn are all facts no row carries, so each one
    // has to be handed in by the caller or the fact silently defaults to "no".
    expect(app).toMatch(/waitingOn:\s*waitingOn\(i\)/);
    expect(app).toMatch(/const waitingOn\s*=/);
  });
});
