// THE COMMAND BAR OFFERS MARK UNREAD ON THREADS THAT SHOW AS READ.
//
// Asked on w-046a6b790b (2026-10-20): ten threads in Needs You, none with the
// dot or the heavier title, all ticked with ⌘A, and ⌘K offered only "Mark Read
// (10 selected)". The row draws read state from `seenAt` (when you last opened
// each thread, threads older than the feature counting as read), but the
// command bar asked the older `seen` set of opened ids. A thread you never
// opened in this app, or opened before `seenAt` was kept, looked read and was
// offered Mark Read. The batch Mark Read also wrote only `seen`, so it could not
// clear a dot. Measured by reading App.tsx: the batch had no Mark Unread at all,
// and the single-thread choice was `seen.has(target.id)`.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isUnread, readMoves } from '../renderer/src/unread.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, '..', 'renderer', 'src', 'App.tsx'), 'utf8');

const SINCE = 1_000;
const thread = (id, createdAt, resultTs) => ({
  id, createdAt, wrote: resultTs == null ? {} : { result: { ts: resultTs, source: 'agent' } },
});

describe('threads that show as read', () => {
  it('are offered Mark Unread and not Mark Read, as in the ten that were reported', () => {
    // Older than the feature and never opened since: no dot, nothing in seenAt.
    const ten = Array.from({ length: 10 }, (_, k) => thread(`t${k}`, 100 + k, 500 + k));
    expect(ten.every((t) => !isUnread(t, {}, SINCE))).toBe(true);
    expect(readMoves(ten, {}, SINCE)).toEqual({ read: false, unread: true });
  });
  it('include one opened at the very moment its answer arrived', () => {
    expect(readMoves([thread('a', 100, 3_000)], { a: 3_000 }, SINCE)).toEqual({ read: false, unread: true });
  });
});

describe('threads that show as unread', () => {
  it('are offered Mark Read and not Mark Unread', () => {
    expect(readMoves([thread('a', 1_500)], {}, SINCE)).toEqual({ read: true, unread: false });
  });
  it('include one an agent answered a moment after you opened it', () => {
    expect(readMoves([thread('a', 100, 3_001)], { a: 3_000 }, SINCE)).toEqual({ read: true, unread: false });
  });
  it('include one you marked unread', () => {
    expect(readMoves([thread('a', 100, 900)], { a: 0 }, SINCE)).toEqual({ read: true, unread: false });
  });
});

describe('a selection of both', () => {
  it('is offered both', () => {
    const both = [thread('read', 100, 900), thread('unread', 1_500)];
    expect(readMoves(both, {}, SINCE)).toEqual({ read: true, unread: true });
  });
});

describe('the command bar', () => {
  it('asks the same question the dot asks, for one thread and for a selection', () => {
    expect(app).toMatch(/isUnread\(target, seenAt, unreadSince\)\s*\? \{ id: 'read'/);
    expect(app).toMatch(/readMoves\(sel, seenAt, unreadSince\)/);
    expect(app).not.toMatch(/seen\.has\(target\.id\)/);
  });
  it('offers Mark unread on a selection', () => {
    expect(app).toMatch(/label: `Mark unread \(\$\{n\} selected\)`/);
  });
  it('writes the time the dot reads when it marks a selection read or unread', () => {
    expect(app).toMatch(/sel\.forEach\(markSeen\)/);
    expect(app).toMatch(/sel\.forEach\(markUnseen\)/);
  });
});
