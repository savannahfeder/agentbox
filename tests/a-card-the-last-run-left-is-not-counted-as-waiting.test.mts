// "+5 WAITING" WITH THREE AGENTS STOPPED (F-88, QA session 14, 2026-10-26).
//
// Three threads were parked on a git commit approval. The app was relaunched,
// resumed the three, and the card then read "+5 waiting" -- six cards for three
// questions -- and "+6" once a fourth thread asked. Only four rows in the whole
// inbox were Asking.
//
// WHAT THE OTHER THREE WERE. A request file is how a worker asks, and it is
// kept alive by whoever is waiting on it: both engines put their own file back
// if anything removes it while their question still stands. Quitting takes
// every worker down with the app, so the three files the dead run left had
// nobody waiting on them -- but nothing removed them either until
// REQUEST_TTL_MS, sixteen minutes later, and in the meantime the three resumed
// runs raised three more. The count is `listPending().length - 1`, so it
// counted both sets.
//
// AND THEY COULD NOT HAVE BEEN ANSWERED EITHER. The key that signs an answer is
// generated per run and never written down, so even a worker that somehow
// outlived the app would read this run's answer as a forgery and delete it.
// A card nothing can answer is not a card.
//
// Measured: three requests in the spool, relaunch, three more raised ->
// listPending returned six.

import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dropCardsFromTheLastRun, listPending, spoolDir } from '../main/approvals.mts';

const dirs = [];
function spool() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-last-run-'));
  dirs.push(root);
  const dir = spoolDir(root);
  fs.mkdirSync(dir, { recursive: true });
  return { root, dir };
}
afterAll(() => { for (const d of dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } } });

const ask = (dir, id, item) => fs.writeFileSync(path.join(dir, `${id}.request.json`),
  JSON.stringify({ id, at: Date.now(), product: 'sandbox-1', item, tool: 'Bash', input: { command: 'git commit -m hi' } }));

/** What the card draws beside the lede: everything behind the one on stage. */
const waiting = (root) => Math.max(0, listPending(root).length - 1);

describe('the cards in the spool when the app starts', () => {
  it('are not counted as waiting, because the run that raised them has ended', () => {
    const { root, dir } = spool();
    ask(dir, 'dead-1', 'w-ascii');
    ask(dir, 'dead-2', 'w-reverse');
    ask(dir, 'dead-3', 'w-is-blank');
    expect(listPending(root)).toHaveLength(3);

    // The relaunch.
    expect(dropCardsFromTheLastRun(root)).toBe(3);
    expect(listPending(root)).toEqual([]);

    // The three resumed runs ask again, each with a new id of its own.
    ask(dir, 'live-1', 'w-ascii');
    ask(dir, 'live-2', 'w-reverse');
    ask(dir, 'live-3', 'w-is-blank');

    // RED BEFORE THE FIX: six, and the card read "+5 waiting".
    expect(listPending(root).map((r) => r.id)).toEqual(['live-1', 'live-2', 'live-3']);
    expect(waiting(root)).toBe(2);
  });

  it('stay gone when an orphan that outlived the app puts its own file back', () => {
    // The boundary on one side. A worker orphaned by a crash rather than a quit
    // goes on waiting, and its loop writes its request again every two seconds
    // (main/approval-prompt-core.mts). It still holds the last run's public
    // key, so this run's answer is a forgery to it: the card is unanswerable
    // however many times it comes back, and it must not come back.
    const { root, dir } = spool();
    ask(dir, 'orphan', 'w-ascii');
    dropCardsFromTheLastRun(root);

    ask(dir, 'orphan', 'w-ascii');
    expect(listPending(root)).toEqual([]);
  });

  it('are the only ones dropped: a card raised a moment later is hers to answer', () => {
    // The boundary on the other side, and the case that must NOT match. This
    // runs once, before the supervisor starts anything, so nothing of this
    // run's can be caught by it.
    const { root, dir } = spool();
    expect(dropCardsFromTheLastRun(root)).toBe(0);
    ask(dir, 'first-of-this-run', 'w-ascii');
    expect(listPending(root).map((r) => r.id)).toEqual(['first-of-this-run']);
    expect(waiting(root)).toBe(0);
  });

  it('take their answer file with them, so no stale yes is left lying in the spool', () => {
    const { root, dir } = spool();
    ask(dir, 'dead', 'w-ascii');
    fs.writeFileSync(path.join(dir, 'dead.answer.json'), JSON.stringify({ allow: true }));
    dropCardsFromTheLastRun(root);
    expect(fs.readdirSync(dir).filter((f) => f.startsWith('dead'))).toEqual([]);
  });

  it('leaves the log alone, which is the account of what was decided', () => {
    const { root, dir } = spool();
    fs.writeFileSync(path.join(dir, 'log.jsonl'), '{"id":"old"}\n');
    ask(dir, 'dead', 'w-ascii');
    dropCardsFromTheLastRun(root);
    expect(fs.readFileSync(path.join(dir, 'log.jsonl'), 'utf8')).toBe('{"id":"old"}\n');
  });
});
