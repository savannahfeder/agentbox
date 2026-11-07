// EVERY LINE A SIGNED-IN MAC WRITES SAYS WHO WROTE IT, AND A TEAMMATE'S LINES
// COME IN THROUGH THE SAME ONE WRITE PATH, ONCE EACH.
//
// The team version syncs a shared project's ledger between Macs. Two things
// make that safe, and both live where lines reach the disk:
//
// 1. Stamping. A line written while someone is signed in carries `by` (their
//    person id) and `uid` (its own id). Sync pushes only lines this person
//    wrote, so a line pulled from Theo is never pushed back as Maya's. The
//    MCP server is a separate process, so it learns the person from the
//    AGENTBOX_PERSON_ID the supervisor hands it.
// 2. Pulling in. A teammate's lines are appended verbatim, and a line whose
//    uid is already in the ledger is skipped, so pulling the same page twice
//    (a retry, a reconnect) cannot double anything.
//
// With nobody signed in nothing is stamped, so the public, single-person app
// writes exactly the lines it always wrote.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mjs';

let dir;
const lastLine = () => {
  const text = fs.readFileSync(disk._internals.ledgerPath(dir), 'utf8').trim().split('\n');
  return JSON.parse(text[text.length - 1]);
};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'team-stamp-'));
  disk._internals.forgetFolds();
  disk.setLineAuthor(null);
  delete process.env.AGENTBOX_PERSON_ID;
});
afterEach(() => {
  disk.setLineAuthor(null);
  delete process.env.AGENTBOX_PERSON_ID;
});

describe('stamping', () => {
  it('writes no writer when nobody is signed in', () => {
    disk.createWorkItem(dir, { title: 'solo' });
    const line = lastLine();
    expect(line.by).toBeUndefined();
    expect(line.uid).toBeUndefined();
  });

  it('stamps the signed-in person and a fresh id on every kind of line', async () => {
    disk.setLineAuthor('p-maya');
    const item = disk.createWorkItem(dir, { title: 'Acme renewal' });
    const created = lastLine();
    disk.updateWorkItem(dir, item.id, { note: 'started' }, { source: 'founder' });
    const updated = lastLine();
    await disk.claimWorkItem(dir, { id: item.id, holder: 'worker-1' });
    const claim = lastLine();
    for (const line of [created, updated, claim]) {
      expect(line.by).toBe('p-maya');
      expect(line.uid).toMatch(/^l-[0-9a-f]{16}$/);
    }
    expect(new Set([created.uid, updated.uid, claim.uid]).size).toBe(3);
    expect(disk.readWorkItem(dir, item.id).createdBy).toBe('p-maya');
  });

  it('learns the person from the environment in a process main did not set up', () => {
    process.env.AGENTBOX_PERSON_ID = 'p-jun';
    disk.createWorkItem(dir, { title: 'from the store server' });
    expect(lastLine().by).toBe('p-jun');
  });

  it('prefers the person main set over the environment', () => {
    process.env.AGENTBOX_PERSON_ID = 'p-jun';
    disk.setLineAuthor('p-maya');
    disk.createWorkItem(dir, { title: 'x' });
    expect(lastLine().by).toBe('p-maya');
  });
});

describe('pulling a teammate in', () => {
  const theirs = (uid, patch, ts = 100) => ({ id: 'w-abcdef', ts, source: 'founder', by: 'p-theo', uid, patch });

  it('appends their lines verbatim and folds them', () => {
    disk.setLineAuthor('p-maya');
    const n = disk.appendForeignLines(dir, [theirs('l-1', { title: 'Launch video', status: 'open' }), theirs('l-2', { answer: 'Ship it' }, 101)]);
    expect(n).toBe(2);
    const item = disk.readWorkItem(dir, 'w-abcdef');
    expect(item.title).toBe('Launch video');
    expect(item.answer).toBe('Ship it');
    expect(item.wrote.answer.by).toBe('p-theo');
    // Verbatim: still Theo's, not re-stamped as the signed-in person's.
    expect(lastLine().by).toBe('p-theo');
    expect(lastLine().uid).toBe('l-2');
  });

  it('skips a line it already has, so a page pulled twice is stored once', () => {
    disk.appendForeignLines(dir, [theirs('l-1', { title: 'Launch video' })]);
    const again = disk.appendForeignLines(dir, [theirs('l-1', { title: 'Launch video' }), theirs('l-3', { note: 'new' }, 102)]);
    expect(again).toBe(1);
    const all = fs.readFileSync(disk._internals.ledgerPath(dir), 'utf8').trim().split('\n');
    expect(all).toHaveLength(2);
  });

  // Review 2026-10-01: one pulled line over the 256 KiB ceiling made writeLine
  // throw, the pull cursor never moved past it, and every later line from
  // that project was stuck behind it for good.
  it('skips a line too big to write instead of throwing, and keeps the rest', () => {
    const huge = theirs('l-big', { note: 'x'.repeat(300 * 1024) });
    expect(disk.appendForeignLines(dir, [huge, theirs('l-after', { note: 'after' }, 101)])).toBe(1);
    expect(disk.readWorkItem(dir, 'w-abcdef').note).toBe('after');
  });

  it('refuses a line with no uid or no writer, which cannot be told apart on the next pull', () => {
    expect(disk.appendForeignLines(dir, [{ id: 'w-abcdef', ts: 1, source: 'founder', patch: { title: 'x' } }])).toBe(0);
    expect(disk.appendForeignLines(dir, [{ id: 'w-abcdef', ts: 1, source: 'founder', uid: 'l-9', patch: { title: 'x' } }])).toBe(0);
  });

  it('reads back the lines after a byte offset, which is how a push knows where it stopped', () => {
    disk.setLineAuthor('p-maya');
    disk.createWorkItem(dir, { title: 'one' });
    const { lines: first, end } = disk.readLinesFrom(dir, 0);
    expect(first).toHaveLength(1);
    disk.createWorkItem(dir, { title: 'two' });
    const { lines: next, end: end2 } = disk.readLinesFrom(dir, end);
    expect(next.map((l) => l.patch.title)).toEqual(['two']);
    expect(end2).toBeGreaterThan(end);
    expect(disk.readLinesFrom(dir, end2).lines).toEqual([]);
  });

  it('reads nothing from a ledger that does not exist yet', () => {
    expect(disk.readLinesFrom(path.join(dir, 'nowhere'), 0)).toEqual({ lines: [], end: 0 });
  });
});
