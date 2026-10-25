// A REPLY DOES NOT HOLD BACK A SHIP, AND THE IMPORTANT THREAD GOES FIRST.
//
// WHY, 2026-10-19. 25 ships were attempted in four hours on this Mac and 12
// landed; one thread's change took about two hours to reach main. Two reasons
// sat in the queue rather than in the tests.
//
// The queue skipped any thread whose agent was running, because the agent that
// marks a thread ready is still finishing when the label lands and its commits
// may not be in yet. But a thread already waiting to ship, replied to hours
// later, starts a NEW session, and that session held its ship back for as long
// as it ran. The session that marked the row is the only one worth waiting
// for, and it is the one that started BEFORE the label.
//
// And the queue took the oldest label first, so a thread the person is waiting
// on queued behind every older one. It goes by what the app already ranks work
// by — the row's priority — and only then by who asked first.
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SHIP_LABEL, nextToShip } from '../main/ship-queue.mjs';

let tmp; let repo; let folders;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-order-'));
  repo = path.join(tmp, 'repo');
  folders = path.join(tmp, 'folders');
  fs.mkdirSync(path.join(repo, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'scripts', 'ship.mjs'), '');
  for (const id of ['w-a', 'w-b', 'w-c']) fs.mkdirSync(path.join(folders, id), { recursive: true });
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const products = () => [{ slug: 'team', repoPath: repo }];
const settings = { team: { script: 'scripts/ship.mjs' } };
const folderFor = (item) => path.join(folders, item.id);
const row = (id, over = {}) => ({
  id, product: 'team', status: 'blocked', labels: [SHIP_LABEL], wrote: { labels: { ts: 1000 } }, ...over,
});
const next = (items, opts = {}) => nextToShip(items, products(), settings, { folderFor, ...opts })?.item.id ?? null;

describe('a thread whose agent is still running', () => {
  it('waits, when that agent is the one that marked it ready', () => {
    // The session started before the label, so its commits may not all be in.
    expect(next([row('w-a')], { isLive: () => true, liveSince: () => 900 })).toBe(null);
  });

  it('ships anyway when the session started after the label, which is a reply', () => {
    expect(next([row('w-a')], { isLive: () => true, liveSince: () => 1100 })).toBe('w-a');
  });

  it('waits when nothing can say when the session started', () => {
    // A cloud run whose folder has not come home reads as live with no start:
    // shipping it would push a stale branch and call it shipped.
    expect(next([row('w-a')], { isLive: () => true, liveSince: () => null })).toBe(null);
    expect(next([row('w-a')], { isLive: () => true })).toBe(null);
  });

  it('ships when no session is on it at all, whatever the start says', () => {
    expect(next([row('w-a')], { isLive: () => false, liveSince: () => 900 })).toBe('w-a');
  });
});

describe('which of several waiting threads goes first', () => {
  it('is the one the person marked most important, not the oldest', () => {
    const items = [
      row('w-a', { priority: 0, wrote: { labels: { ts: 10 } } }),
      row('w-b', { priority: 9, wrote: { labels: { ts: 90 } } }),
    ];
    expect(next(items)).toBe('w-b');
  });

  it('is the one that asked first when they matter the same, as it always was', () => {
    const items = [
      row('w-a', { priority: 5, wrote: { labels: { ts: 90 } } }),
      row('w-b', { priority: 5, wrote: { labels: { ts: 10 } } }),
    ];
    expect(next(items)).toBe('w-b');
  });

  it('reads a row with no priority as nought, the way every other list here does', () => {
    // shared/work-items.mjs sorts the queue a puller sees by `priority ?? 0`.
    const items = [
      row('w-a', { wrote: { labels: { ts: 10 } } }),
      row('w-b', { priority: 1, wrote: { labels: { ts: 90 } } }),
    ];
    expect(next(items)).toBe('w-b');
  });

  it('never picks a higher-priority thread that is not ready to ship', () => {
    const items = [
      row('w-a', { priority: 9, labels: [] }),
      row('w-b', { priority: 0 }),
    ];
    expect(next(items)).toBe('w-b');
  });
});
