// LATER, THEN Z, MOVED THE THREAD UP THE LIST (QA batch 011, F-167).
//
// Needs you held "Gregorian" (3 min ago) above "RepeatString" (5 min ago). The
// tester put RepeatString off to Later and pressed Z; it came back above
// Gregorian. Both the snooze and the undo were bare `snoozedUntil` lines of
// hers, and the fold counted each as news on the thread, so `updatedAt` jumped
// to the undo. Measured through the store's own writes and the list's own sort,
// the same way an undone close is (an-undone-close-puts-the-thread-back-in-its-place).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createWorkItem, updateWorkItem, readWorkItem, setLineAuthor } from '../main/store/work-items.mjs';
import { sorted, DEFAULT_DISPLAY } from '../renderer/src/threads/page-rules.ts';
import { byRunningOrder, placedAt } from '../renderer/src/list-rules.ts';

const MIN = 60_000;
const NOW = new Date(2026, 10, 3, 15, 0).getTime();
let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'undone-later-')); setLineAuthor(null); });
afterEach(() => { setLineAuthor(null); fs.rmSync(dir, { recursive: true, force: true }); });

const make = (title, at) => createWorkItem(dir, { title, priority: 5 }, { source: 'founder', now: at }).id;
const write = (id, patch, at, source = 'founder') => updateWorkItem(dir, id, patch, { source, now: at });
const read = (id) => readWorkItem(dir, id, NOW);
const order = (ids) => sorted(ids.map(read), DEFAULT_DISPLAY.inbox, 'inbox').map((i) => i.title);
const running = (ids) => ids.map(read).sort(byRunningOrder(() => 0)).map((i) => i.title);

describe('putting a thread off to Later and taking it back with Z', () => {
  it('leaves it below the newer thread, where it was before', () => {
    const repeat = make('RepeatString', NOW - 5 * MIN);
    const leap = make('Gregorian', NOW - 3 * MIN);
    expect(running([repeat, leap])).toEqual(['Gregorian', 'RepeatString']);
    write(repeat, { snoozedUntil: NOW + 30 * MIN }, NOW - 2 * MIN);
    write(repeat, { snoozedUntil: 0 }, NOW - MIN);
    expect(placedAt(read(repeat))).toBe(NOW - 5 * MIN);
    expect(running([repeat, leap])).toEqual(['Gregorian', 'RepeatString']);
    expect(order([repeat, leap])).toEqual(['Gregorian', 'RepeatString']);
  });

  it('while the time the row last changed still moves forward', () => {
    const repeat = make('RepeatString', NOW - 5 * MIN);
    write(repeat, { snoozedUntil: NOW + 30 * MIN }, NOW - 2 * MIN);
    write(repeat, { snoozedUntil: 0 }, NOW - MIN);
    expect(read(repeat).updatedAt).toBe(NOW - MIN);
  });

  it('on a signed-in Mac too, when the one who put it off takes it back', () => {
    setLineAuthor('person-a');
    const repeat = make('RepeatString', NOW - 60 * MIN);
    write(repeat, { snoozedUntil: NOW + 30 * MIN }, NOW - 2 * MIN);
    write(repeat, { snoozedUntil: 0 }, NOW - MIN);
    expect(placedAt(read(repeat))).toBe(NOW - 60 * MIN);
  });
});

describe('what still moves it', () => {
  it('news on the thread between Later and the undo', () => {
    const repeat = make('RepeatString', NOW - 60 * MIN);
    write(repeat, { snoozedUntil: NOW + 30 * MIN }, NOW - 3 * MIN);
    write(repeat, { note: 'found another case' }, NOW - 2 * MIN, 'agent');
    write(repeat, { snoozedUntil: 0 }, NOW - MIN);
    expect(placedAt(read(repeat))).toBe(NOW - MIN);
  });

  it('someone else taking it back', () => {
    setLineAuthor('person-a');
    const repeat = make('RepeatString', NOW - 60 * MIN);
    write(repeat, { snoozedUntil: NOW + 30 * MIN }, NOW - 3 * MIN);
    setLineAuthor('person-b');
    write(repeat, { snoozedUntil: 0 }, NOW - MIN);
    expect(placedAt(read(repeat))).toBe(NOW - MIN);
  });

  it('moving it to another time rather than taking it back', () => {
    const repeat = make('RepeatString', NOW - 60 * MIN);
    write(repeat, { snoozedUntil: NOW + 30 * MIN }, NOW - 3 * MIN);
    write(repeat, { snoozedUntil: NOW + 240 * MIN }, NOW - MIN);
    expect(placedAt(read(repeat))).toBe(NOW - MIN);
  });

  it('carries none of the bookkeeping out on the row', () => {
    const repeat = make('RepeatString', NOW - 60 * MIN);
    write(repeat, { snoozedUntil: NOW + 30 * MIN }, NOW - MIN);
    expect(Object.keys(read(repeat))).not.toContain('snoozedFrom');
  });
});
