// A SIGNED-OUT ACCOUNT MUST NOT EAT THE FLEET, AND MUST NOT TALK.
//
// Measured on her machine, 2026-08-24. Her second subscription's login expired
// at 10:39. From then until 18:17 the app said "2 agents picked up where they
// left off" every fifteen seconds along the bottom of her screen, and her
// agents did nothing for seven and a half hours.
//
// Nothing here was misbehaving on its own. Three correct pieces multiplied:
//
//   1. Two rows in `_liveSessions` had their sessions on the signed-out
//      account. Their transcripts are on disk, so the sweep is right that they
//      are resumable.
//   2. `_resumeInterrupted` FORCES the row's own profile — which is the whole
//      point of resume, the session lives in that account's home and nowhere
//      else — so it walked straight past the account quarantine that
//      `_pickProfile` respects. Both spawns died in about two seconds on
//      "Failed to authenticate: OAuth session expired".
//   3. They were still in `_liveSessions`, so the next sweep resumed them
//      again. Every pass they filled the last two of three slots, which is why
//      the one healthy account never got to start anything, and every pass
//      reported `resumed: 2` to the toast.
//
// So the loop was self-feeding and it was LOUD, and each of those is its own
// bug: an account that cannot start a session cannot resume one either, and a
// toast is news, not a status line.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { Name } from '../shared/product-name.mjs';

const SECOND = '/second-account';

const row = (id) => ({
  id, product: 'agentbox', status: 'open', title: id,
  answer: 'A', wrote: { answer: { ts: 1_786_760_000_000, source: 'founder' } },
});

let root;
let sup;
let spawned;
let toasts;

const build = (items) => {
  const s = new Supervisor(
    {
      storeRoot: root,
      maxConcurrentSessions: 3,
      authProfiles: ['default', SECOND],
      personalProducts: ['you'],
    },
    { listItems: () => items, listProducts: () => [{ slug: 'agentbox', name: Name, dir: root }], isDue: () => true },
    root,
  );
  spawned = [];
  toasts = [];
  s.spawnWorker = (item, opts) => { spawned.push({ id: item.id, ...opts }); s.sessions.set(item.id, { itemId: item.id }); };
  // Every session on disk, so the only thing under test is the ACCOUNT.
  s.transcriptFile = (rec) => `/transcripts/${rec.sessionId}.jsonl`;
  s.onRecovered = (r) => { toasts.push(r); };
  return s;
};

const stranded = (id, profile) => {
  sup._liveSessions[id] = { sessionId: `sess-${id}`, product: 'agentbox', cwd: root, profile };
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-signedout-'));
});
afterEach(() => { try { fs.rmSync(root, { recursive: true, force: true }); } catch {} });

describe('an account that cannot start a session cannot resume one either', () => {
  it('does not hand a row back to an account that is resting', () => {
    sup = build([row('w-one')]);
    stranded('w-one', SECOND);
    // What a signed-out account earns on its first dead spawn: `needsHerHands`
    // makes the strike hard, so it leaves the rotation immediately.
    sup._strikeProfile(SECOND, { hard: true });

    const out = sup.recoverInterrupted('startup');

    expect(spawned).toEqual([]);
    expect(out.resumed).toBe(0);
    // NOT `waiting`. Waiting is her word for a session that is gone off disk
    // and needs a person; this session is intact and the account comes back on
    // its own, so nothing is asked of her.
    expect(out.waiting).toBe(0);
    expect(out.resting).toBe(1);
    // Remembered, and asked again, so the row resumes itself the moment the
    // account is usable.
    expect(sup._liveSessions['w-one']).toBeTruthy();
    expect(sup._recoverPending).toBe(true);
  });

  it('leaves the healthy account its slots while the other one is out', () => {
    // The seven and a half hours. Two dead-account rows were taking two of the
    // three slots on every pass, so the row that COULD have run never did.
    sup = build([row('w-dead-1'), row('w-dead-2'), row('w-good')]);
    stranded('w-dead-1', SECOND);
    stranded('w-dead-2', SECOND);
    stranded('w-good', 'default');
    sup._strikeProfile(SECOND, { hard: true });

    const out = sup.recoverInterrupted('startup');

    expect(spawned.map((s) => s.id)).toEqual(['w-good']);
    expect(out.resumed).toBe(1);
    expect(out.resting).toBe(2);
    expect(out.queued).toBe(0);
  });

  it('resumes the row the moment the account is usable again', () => {
    sup = build([row('w-one')]);
    stranded('w-one', SECOND);
    sup._strikeProfile(SECOND, { hard: true });
    expect(sup.recoverInterrupted('startup').resumed).toBe(0);

    // She typed /login. A session that survives clears the account.
    sup._clearProfileTrouble(SECOND);

    const out = sup.recoverInterrupted('capacity');
    expect(out.resumed).toBe(1);
    // `engine` RIDES WITH IT NOW. The sweep is putting a session that already
    // exists back on its row, and a session belongs to the harness that wrote
    // it, so the engine is forced from the record rather than decided again
    // inside spawnWorker -- which could disagree and hand a thread id to the
    // wrong CLI.
    expect(spawned).toEqual([{ id: 'w-one', continuation: true, resumeSessionId: 'sess-w-one', profile: SECOND, engine: 'claude' }]);
  });
});

describe('the toast is news, not a status line', () => {
  it('says nothing at all about rows that are only resting', () => {
    sup = build([row('w-one')]);
    stranded('w-one', SECOND);
    sup._strikeProfile(SECOND, { hard: true });
    for (let i = 0; i < 5; i += 1) sup.recoverInterrupted('capacity');
    expect(toasts).toEqual([]);
  });

  it('announces the same row once, however many sweeps resume it', () => {
    // The belt to the fix above's braces. ANY resume that keeps dying on
    // arrival — a crash loop, a folder that vanished, something we have not
    // met yet — would otherwise be a sentence along the bottom of her screen
    // every fifteen seconds for as long as it lasted.
    sup = build([row('w-one')]);
    stranded('w-one', 'default');

    sup.recoverInterrupted('startup');
    expect(toasts.length).toBe(1);
    expect(toasts[0].resumed).toBe(1);

    // It died on arrival and was reaped, so the next sweep sees the same
    // stranded row and resumes it again. Correct, and not worth saying twice.
    sup.sessions.delete('w-one');
    sup.recoverInterrupted('capacity');
    sup.sessions.delete('w-one');
    sup.recoverInterrupted('capacity');

    expect(spawned.length).toBe(3);
    expect(toasts.length).toBe(1);
  });

  it('speaks again for a resume that stuck and was interrupted later', () => {
    // The other half of the rule: a row whose worker actually took the work is
    // a fresh piece of news the next time the lid closes on it.
    sup = build([row('w-one')]);
    stranded('w-one', 'default');
    sup.recoverInterrupted('startup');
    expect(toasts.length).toBe(1);

    // A sweep that finds a worker on the row: the resume stuck.
    expect(sup.recoverInterrupted('wake').running).toBe(1);

    // Hours later, the machine sleeps and it is stranded again.
    sup.sessions.delete('w-one');
    sup.recoverInterrupted('wake');
    expect(toasts.length).toBe(2);
  });

  it('still tells her about rows that need her hands', () => {
    sup = build([row('w-gone')]);
    stranded('w-gone', 'default');
    sup.transcriptFile = () => null;
    const out = sup.recoverInterrupted('startup');
    expect(out.waiting).toBe(1);
    expect(toasts.length).toBe(1);
  });
});
