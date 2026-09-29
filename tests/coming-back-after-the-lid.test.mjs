// SHE OPENS THE LAPTOP AND THE AGENTS ARE BACK ON THEIR WORK.
//
// And the correction that decides the shape of it: resume the agent, never
// restart it.
//
// Three facts this is built on, all measured out of her own store on 08-14:
//
//   1. Nothing in the app knew the machine had ever slept. `powerMonitor` appeared
//      nowhere in main/, and startup looked only for fresh work, never at the
//      wreckage the last run left.
//   2. Her answer is marked delivered at SPAWN, which is a promise that a worker
//      will carry it. If the app is not alive to watch that worker exit, the
//      promise stands forever and no tick ever looks at the row again. The row
//      is not in her inbox while that happens, because an answered row leaves
//      the inbox on exactly that promise. Silent by construction.
//   3. A product worker's session id existed only in memory. 1,488 sessions in
//      12 days, 144 with no last line at all: the app went away before it could
//      reap them, in 34 mass die-offs, about three a day.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { recoveryToast } from '../shared/recovery.mjs';
import { Name } from '../shared/product-name.mjs';

// A MAC WITH ONE CLAUDE LOGIN ON IT. Since 2026-08-31 the fleet's account list
// is what is signed in on the disk and not only what the config names
// (main/account-discovery.mjs), so a Supervisor built with no `home` reads
// whoever is signed in on the machine running the suite — and a developer with
// a second subscription would silently get twice the capacity these tests are
// about. A home with nothing in it is the machine every one of them means.
const ONE_ACCOUNT_HOME = '/nonexistent-home-with-no-second-account';


const ITEM = {
  id: 'w-d2b0cc128d',
  product: 'agentbox',
  status: 'open',
  title: 'the row that waited on one word from 14:33',
  answer: 'A',
  wrote: { answer: { ts: 1_786_760_000_000, source: 'founder' } },
};

let root;
let sup;
let spawned;

// A supervisor with no processes in it: spawnWorker is replaced by a recorder,
// so every assertion below is about WHAT WOULD BE SPAWNED AND HOW, which is the
// entire decision this change makes.
const build = (items = [ITEM]) => {
  const s = new Supervisor(
    { home: ONE_ACCOUNT_HOME, storeRoot: root, maxConcurrentSessions: 3, authProfiles: ['default'] },
    { listItems: () => items, listProducts: () => [{ slug: 'agentbox', name: Name, dir: root }], isDue: () => true },
    root,
  );
  spawned = [];
  s.spawnWorker = (item, opts) => { spawned.push({ id: item.id, ...opts }); s.sessions.set(item.id, { itemId: item.id }); };
  return s;
};

// A transcript on disk, where the CLI really keeps them: one file per session
// under the profile's home, in a directory named after the working directory
// with every character that is not a letter or a digit turned into a dash.
const layTranscript = (cwd, sessionId) => {
  const dir = path.join(root, 'fake-home', '.claude', 'projects', String(cwd).replace(/[^a-zA-Z0-9]/g, '-'));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${sessionId}.jsonl`), '{"type":"user"}\n');
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-lid-'));
  sup = build();
});
afterEach(() => { try { fs.rmSync(root, { recursive: true, force: true }); } catch {} });

describe('the session id survives the thing that used to kill it', () => {
  it('is remembered for a product worker, not only for her own chats', () => {
    // The one line that made a resume impossible: the id was written on EXIT,
    // and the interruptions this exists for are the ones where no exit handler
    // ever runs.
    sup._liveSessions[ITEM.id] = { sessionId: 'sess-1', product: 'agentbox', cwd: root, profile: 'default' };
    sup._saveState();
    const back = new Supervisor(
      { home: ONE_ACCOUNT_HOME, storeRoot: root, maxConcurrentSessions: 3, authProfiles: ['default'] },
      { listItems: () => [] }, root,
    );
    expect(back._liveSessions[ITEM.id]?.sessionId).toBe('sess-1');
  });
});

describe('the sweep resumes rather than restarts', () => {
  it('hands the row back to its own session, with its context', () => {
    layTranscript(root, 'sess-1');
    sup._liveSessions[ITEM.id] = { sessionId: 'sess-1', product: 'agentbox', cwd: root, profile: path.join(root, 'fake-home', '.claude') };
    const out = sup.recoverInterrupted('wake');
    expect(out.resumed).toBe(1);
    // `engine` RIDES WITH IT NOW. The sweep is putting a session that already
    // exists back on its row, and a session belongs to the harness that wrote
    // it, so the engine is forced from the record rather than decided again
    // inside spawnWorker -- which could disagree and hand a thread id to the
    // wrong CLI.
    expect(spawned).toEqual([{ id: ITEM.id, continuation: true, resumeSessionId: 'sess-1', profile: path.join(root, 'fake-home', '.claude'), engine: 'claude' }]);
  });

  it('clears the delivery mark that was keeping every tick away from the row', () => {
    // Fact 2. Without this the resumed session could die a second time and
    // nothing would ever look at the row again.
    layTranscript(root, 'sess-1');
    sup._liveSessions[ITEM.id] = { sessionId: 'sess-1', product: 'agentbox', cwd: root, profile: path.join(root, 'fake-home', '.claude') };
    sup._deliveryAttempts[`agentbox:${ITEM.id}:A:0`] = 3; // at the cap: given up
    sup.recoverInterrupted('startup');
    expect(Object.keys(sup._deliveryAttempts).filter((k) => k.startsWith(`agentbox:${ITEM.id}:`))).toEqual([]);
    // And re-made for the session now carrying her answer, so two sweeps in a
    // row cannot put two workers on one row.
    expect(sup._answerDelivered(ITEM)).toBe(true);
  });

  it('leaves a row it cannot resume for her, and restarts nothing', () => {
    // Her option 1, exactly. No transcript on disk means no session to resume,
    // only a stranger to brief.
    sup._liveSessions[ITEM.id] = { sessionId: 'gone', product: 'agentbox', cwd: root, profile: path.join(root, 'fake-home', '.claude') };
    sup._handledAnswers.add(sup._answerKey(ITEM));
    const out = sup.recoverInterrupted('wake');
    expect(out.resumed).toBe(0);
    expect(out.waiting).toBe(1);
    expect(spawned).toEqual([]);
    // The mark is deliberately left standing: clearing it is what would let the
    // ordinary tick put a fresh worker on the row behind her back.
    expect(sup._answerDelivered(ITEM)).toBe(true);
    // And it is still remembered, so the next sweep asks again rather than
    // forgetting the row existed.
    expect(sup._liveSessions[ITEM.id]).toBeTruthy();
  });

  it('never kills a worker that is already running to "resume" it', () => {
    layTranscript(root, 'sess-1');
    sup._liveSessions[ITEM.id] = { sessionId: 'sess-1', product: 'agentbox', cwd: root, profile: path.join(root, 'fake-home', '.claude') };
    sup.sessions.set(ITEM.id, { itemId: ITEM.id });
    const out = sup.recoverInterrupted('wake');
    expect(out.running).toBe(1);
    expect(spawned).toEqual([]);
  });

  it('forgets a row that finished, was archived, or is parked on her', () => {
    for (const status of ['done', 'blocked']) {
      sup = build([{ ...ITEM, status }]);
      sup._liveSessions[ITEM.id] = { sessionId: 'sess-1', product: 'agentbox', cwd: root, profile: 'default' };
      expect(sup.recoverInterrupted('startup').resumed).toBe(0);
      expect(sup._liveSessions[ITEM.id]).toBeUndefined();
      expect(spawned).toEqual([]);
    }
  });

  // Pausing one project held the sweep off it. That feature is deleted
  // (w-d19d6d387c, 2026-09-22) and the fleet-wide pause is what remains.

  it('waits for a slot rather than blowing past the session cap', () => {
    layTranscript(root, 'sess-1');
    const items = [ITEM, { ...ITEM, id: 'w-two' }];
    sup = build(items);
    sup.config.maxConcurrentSessions = 1;
    for (const i of items) {
      sup._liveSessions[i.id] = { sessionId: 'sess-1', product: 'agentbox', cwd: root, profile: path.join(root, 'fake-home', '.claude') };
    }
    const out = sup.recoverInterrupted('startup');
    expect(out.resumed).toBe(1);
    expect(out.queued).toBe(1);
    // A slot, not her: the next tick finishes it without asking anybody.
    expect(sup._recoverPending).toBe(true);
  });
});

describe('startup, which is what covers a crash rather than a sleep', () => {
  it('sweeps BEFORE its first tick, so no stranger reaches the row first', () => {
    // The wreckage of the last run is sitting in the store as rows still
    // `claimed` by workers that no longer exist. The tick re-pulls those the
    // moment their lease lapses and puts a FRESH session on them, which is the
    // restart she ruled out. Order is the whole guarantee.
    layTranscript(root, 'sess-1');
    sup._liveSessions[ITEM.id] = { sessionId: 'sess-1', product: 'agentbox', cwd: root, profile: path.join(root, 'fake-home', '.claude') };
    const order = [];
    sup.tick = async () => { order.push('tick'); };
    const realSweep = sup.recoverInterrupted.bind(sup);
    sup.recoverInterrupted = (why) => { order.push('sweep'); return realSweep(why); };
    sup.start();
    clearInterval(sup._timer);
    expect(order[0]).toBe('sweep');
    expect(spawned[0]?.resumeSessionId).toBe('sess-1');
  });
});

describe('what the resumed session is actually told', () => {
  const product = { slug: 'agentbox', name: Name, dir: '/nowhere' };

  it('is handed the session and a short note, never a second brief', () => {
    const { args } = sup.spawnPlan(ITEM, product, { continuation: true, resumeSessionId: 'sess-1' });
    expect(args).toContain('--resume');
    expect(args[args.indexOf('--resume') + 1]).toBe('sess-1');
    const prompt = args[args.indexOf('-p') + 1];
    expect(prompt).toContain('interrupted');
    expect(prompt).toContain('nothing you did is lost');
    // The brief would arrive AFTER everything the session has already read and
    // would read as an instruction to start over, which is the restart.
    expect(prompt).not.toContain('# How to work');
    // Her answer rides along, because the row is a continuation.
    expect(prompt).toContain('The founder has answered since you stopped');
    expect(prompt).toContain('A');
  });

  it('briefs an ordinary spawn exactly as before', () => {
    const { args } = sup.spawnPlan(ITEM, product, { continuation: true });
    expect(args).not.toContain('--resume');
    expect(args[args.indexOf('-p') + 1]).not.toContain('Your session on this work item was interrupted');
  });

  // A personal thread had a resume path of its own here. Personal projects are
  // deleted (w-d19d6d387c, 2026-09-22) and every row resumes the one way.
});

describe('the one line she actually sees', () => {
  it('says what happened, and where the rest of it is waiting', () => {
    expect(recoveryToast({ resumed: 1, waiting: 0 })).toBe('1 agent picked up where it left off');
    expect(recoveryToast({ resumed: 3, waiting: 0 })).toBe('3 agents picked up where they left off');
    expect(recoveryToast({ resumed: 3, waiting: 1 })).toBe('3 agents resumed · 1 waiting for you in ⌘K');
    expect(recoveryToast({ resumed: 0, waiting: 2 })).toBe('2 agents could not be resumed · waiting for you in ⌘K');
  });

  it('says nothing at all when there was nothing to sweep up', () => {
    // Which is the ordinary morning, and the reason this is a toast and not a
    // line above her first row.
    expect(recoveryToast({ resumed: 0, waiting: 0 })).toBe(null);
    expect(recoveryToast(null)).toBe(null);
  });
});
