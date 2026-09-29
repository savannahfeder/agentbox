// A ROW IS NOT PINNED FOREVER TO AN ACCOUNT ONLY SOMEBODY ELSE CAN MEND.
//
// The mechanism is this. A row is
// a chat: `_rowSessions` remembers the session id AND the account it ran on,
// and `spawnPlan` resumes on that account deliberately, because a transcript
// lives under one profile's home and under no other. That is correct while the
// account works. It is a trap when the account cannot run anything at all: the
// row goes back to the same dead login on every reply she writes, forever, and
// the healthy subscription sitting next to it never gets a turn.
//
// MEASURED on her own store that afternoon. `.zero-supervisor.json` held 67
// remembered row-chats, 28 of them on ~/.claude-work, the account whose
// organization has Claude Code switched off. The row this test is about was one of the 28, and it died
// four times — 10:52:07, 10:53:42, 13:38:19, 14:27:19 — each one within about
// twenty seconds of her writing on the row, each one on that same account,
// while ~/.claude worked the whole time and finished a fresh task she filed the
// same hour. Two of those four spawns went out INSIDE a thirty-minute
// quarantine the app had already put that account in: `_resumeInterrupted`
// checks the quarantine and this path never did.
//
// THE RULE, and the two halves are equally load-bearing:
//
//   - An account that needs A PERSON before it can run again (signed out, or
//     blocked by its organization) does not hold a chat. The row drops the
//     resume, is briefed fresh with its own thread, and goes to a healthy
//     account. A fresh brief is the behaviour every row had before chats
//     existed, so the worst case here is the old normal.
//   - An account that comes back ON ITS OWN keeps its chat. A limit that
//     resets, a run the network cut off, a plain cooldown: the transcript is
//     worth more than the few minutes of waiting, and `_resumeInterrupted`
//     already makes that same judgment in the same words.
//
// And the boundary that stops this from ever making things worse: when there is
// no healthy account left, the chat is kept. Unpinning would lose the thread
// and buy nothing, because there is nowhere better to send it.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { Name } from '../shared/product-name.mjs';

let tmp, blocked;

function putTranscript(profileHome, cwd, sessionId) {
  const dir = path.join(profileHome, 'projects', String(cwd).replace(/[^a-zA-Z0-9]/g, '-'));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${sessionId}.jsonl`), '{}\n');
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-blocked-account-'));
  blocked = path.join(tmp, 'claude-work');
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const productDir = () => path.join(tmp, 'agentbox');
const product = () => ({ slug: 'agentbox', name: Name, dir: productDir() });

function makeSupervisor() {
  const store = { listItems: () => [], listProducts: () => [product()], isDue: () => true };
  const sup = new Supervisor({
    storeRoot: tmp,
    authProfiles: ['default', blocked],
    // A home of this test's own, so the two accounts under test are the only
    // two accounts there are. Without it `discoverProfiles` walks the real
    // machine and quietly adds whatever logins the person running the suite
    // happens to have, and "no healthy account left" becomes untestable.
    home: tmp,
  }, store, tmp);
  sup._saveState = () => {};
  return sup;
}

// Her row, with a chat already recorded on the account that cannot run.
function rowWithChatOn(sup, profile) {
  fs.mkdirSync(productDir(), { recursive: true });
  putTranscript(profile, productDir(), 'sess-on-the-blocked-one');
  sup._rowSessions = {
    'w-8c587e833f': {
      sessionId: 'sess-on-the-blocked-one',
      product: 'agentbox',
      cwd: productDir(),
      profile,
      startedAt: Date.now() - 60_000,
      lastUsedAt: Date.now() - 60_000,
    },
  };
  return {
    id: 'w-8c587e833f',
    product: 'agentbox',
    title: 'We are building the codebase attached',
    body: 'The product is called Powerup.',
    answer: 'still stuck?',
  };
}

const planFor = (sup, item) => sup.spawnPlan(item, product(), { continuation: true });
const resumedId = (plan) => (plan.args.includes('--resume') ? plan.args[plan.args.indexOf('--resume') + 1] : null);

describe('a chat on an account only a person can mend', () => {
  it('lets go of the account whose organization has Claude Code switched off', () => {
    const sup = makeSupervisor();
    const item = rowWithChatOn(sup, blocked);
    sup._profileTrouble = { [blocked]: { cause: 'org-blocked', since: Date.now(), at: Date.now() } };

    const plan = planFor(sup, item);
    // The whole bug in two assertions: her reply no longer goes back to the
    // account that cannot answer it.
    expect(plan.resumeProfile).toBe(null);
    expect(resumedId(plan)).toBe(null);
  });

  it('lets go of an account that really has signed out, for the same reason', () => {
    const sup = makeSupervisor();
    const item = rowWithChatOn(sup, blocked);
    sup._profileTrouble = { [blocked]: { cause: 'signed-out', since: Date.now(), at: Date.now() } };
    expect(planFor(sup, item).resumeProfile).toBe(null);
  });

  it('briefs the fresh session with the row, so nothing she wrote is lost with the thread', () => {
    const sup = makeSupervisor();
    const item = rowWithChatOn(sup, blocked);
    sup._profileTrouble = { [blocked]: { cause: 'org-blocked', since: Date.now(), at: Date.now() } };

    const prompt = planFor(sup, item).args[planFor(sup, item).args.indexOf('-p') + 1];
    expect(prompt).toContain('w-8c587e833f');
    expect(prompt).toContain('still stuck?');
  });
});

// THE CASES THAT MUST NOT MOVE. Each one is a way of turning this fix into the
// bug it is fixing: a row that stops resuming is a row that starts over.
describe('the chats that stay exactly where they are', () => {
  it('keeps the chat when nothing is wrong with the account', () => {
    const sup = makeSupervisor();
    const item = rowWithChatOn(sup, blocked);
    const plan = planFor(sup, item);
    expect(plan.resumeProfile).toBe(blocked);
    expect(resumedId(plan)).toBe('sess-on-the-blocked-one');
  });

  it('keeps the chat through trouble that ends on its own', () => {
    const sup = makeSupervisor();
    const item = rowWithChatOn(sup, blocked);
    for (const cause of ['at-limit', 'interrupted', 'workspace', 'unknown']) {
      sup._profileTrouble = { [blocked]: { cause, since: Date.now(), at: Date.now() } };
      expect(planFor(sup, item).resumeProfile).toBe(blocked);
    }
  });

  it('keeps the chat through a plain thirty-minute quarantine', () => {
    const sup = makeSupervisor();
    const item = rowWithChatOn(sup, blocked);
    sup._profileCooldown = { [blocked]: Date.now() + 30 * 60_000 };
    expect(planFor(sup, item).resumeProfile).toBe(blocked);
  });

  it('keeps the chat when there is no healthy account to move it to', () => {
    const sup = makeSupervisor();
    const item = rowWithChatOn(sup, blocked);
    // Both of her accounts down at once: unpinning would lose the thread and
    // buy nothing, so it does not happen.
    sup._profileTrouble = {
      [blocked]: { cause: 'org-blocked', since: Date.now(), at: Date.now() },
      default: { cause: 'signed-out', since: Date.now(), at: Date.now() },
    };
    const plan = planFor(sup, item);
    expect(plan.resumeProfile).toBe(blocked);
    expect(resumedId(plan)).toBe('sess-on-the-blocked-one');
  });
});

// A RESUME WHOSE ACCOUNT WAS NEVER WRITTEN DOWN, which is what the wake sweep
// hands over: an id, no profile, and the home holding it found by walking disk.
// These two cases used to be about personal threads, which remembered their
// account in a map of their own; personal projects are deleted (w-d19d6d387c,
// 2026-09-22) and the path they exercised is the one that survived them.
describe('a resume whose account has to be found on disk', () => {
  it('starts fresh rather than dying on a blocked account', () => {
    const sup = makeSupervisor();
    putTranscript(blocked, productDir(), 'sess-walked');
    sup._profileTrouble = { [blocked]: { cause: 'org-blocked', since: Date.now(), at: Date.now() } };

    const plan = sup.spawnPlan(
      { id: 'w-1', product: 'agentbox', title: 'Reply Alisha Jain', answer: 'continue' },
      product(),
      { continuation: true, resumeSessionId: 'sess-walked' },
    );
    expect(plan.resumeProfile).toBe(null);
    // AND THE ID GOES WITH IT. A resume id with no account is handed to
    // whichever login the round robin lands on, and that home has never heard
    // of it: the CLI prints "No conversation found" and dies in a second, which
    // is the 2026-08-29 bug arriving by a different door.
    expect(resumedId(plan)).toBe(null);
  });

  it('still resumes on the account that holds it while that account is healthy', () => {
    const sup = makeSupervisor();
    putTranscript(blocked, productDir(), 'sess-walked');

    const plan = sup.spawnPlan(
      { id: 'w-1', product: 'agentbox', title: 'Reply Alisha Jain', answer: 'continue' },
      product(),
      { continuation: true, resumeSessionId: 'sess-walked' },
    );
    expect(plan.resumeProfile).toBe(blocked);
    expect(resumedId(plan)).toBe('sess-walked');
  });
});
