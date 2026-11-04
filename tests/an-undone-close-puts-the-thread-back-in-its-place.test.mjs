// THREADS A Z PUT BACK SAT ABOVE TODAY'S (w-8b637c7802).
//
// A tester closed three old threads in Needs you (Yesterday, Oct 27, Oct 22)
// and pressed Z. They came back above that morning's "just now" threads and
// stayed there. Needs you sorts by level, then newest `updatedAt` first, and
// the fold moved `updatedAt` on both the close and the reopen the undo wrote:
// two lines of hers with nothing new on the thread.
//
// Measured through the store's own writes on disk and the list's own sort.
// The row's place is `placedAt`, not `updatedAt`, which keeps moving forward
// because team sync (main/team/index.mts) and the caches read it as "changed".
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
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'undone-close-')); setLineAuthor(null); });
afterEach(() => { setLineAuthor(null); fs.rmSync(dir, { recursive: true, force: true }); });

const make = (title, at) => createWorkItem(dir, { title, priority: 5 }, { source: 'founder', now: at }).id;
const write = (id, patch, at, source = 'founder') => updateWorkItem(dir, id, patch, { source, now: at });
const read = (id) => readWorkItem(dir, id, NOW);
const order = (ids) => sorted(ids.map(read), DEFAULT_DISPLAY.inbox, 'inbox').map((i) => i.title);

describe('closing a thread and taking it back with Z', () => {
  it('leaves it where it was: below a thread from today, as before the close', () => {
    const old = make('Old thread', NOW - 26 * 60 * MIN);
    const today = make('Today thread', NOW - 5 * MIN);
    expect(order([old, today])).toEqual(['Today thread', 'Old thread']);
    write(old, { status: 'done' }, NOW - 2 * MIN);
    write(old, { status: 'open' }, NOW - MIN);
    expect(read(old).status).toBe('open');
    expect(placedAt(read(old))).toBe(NOW - 26 * 60 * MIN);
    expect(order([old, today])).toEqual(['Today thread', 'Old thread']);
  });

  it('while the time the row last changed still moves forward', () => {
    const old = make('Old thread', NOW - 26 * 60 * MIN);
    write(old, { status: 'done' }, NOW - 2 * MIN);
    write(old, { status: 'open' }, NOW - MIN);
    expect(read(old).updatedAt).toBe(NOW - MIN);
  });

  it('three old threads closed together and put back keep their order among themselves', () => {
    const ids = [['Yesterday', 24 * 60], ['Oct 27', 7 * 24 * 60], ['Oct 22', 12 * 24 * 60]].map(([t, ago]) => make(t, NOW - ago * MIN));
    const today = make('Just now', NOW - 3 * MIN);
    for (const id of ids) write(id, { status: 'done' }, NOW - 2 * MIN);
    for (const id of ids) write(id, { status: 'open' }, NOW - MIN);
    expect(order([...ids, today])).toEqual(['Just now', 'Yesterday', 'Oct 27', 'Oct 22']);
    const running = [...ids, today].map(read).sort(byRunningOrder(() => 0)).map((i) => i.title);
    expect(running).toEqual(['Just now', 'Yesterday', 'Oct 27', 'Oct 22']);
  });

  it('a line that is not news in between (a label) does not stop it', () => {
    const old = make('Old thread', NOW - 60 * MIN);
    write(old, { status: 'done' }, NOW - 3 * MIN);
    write(old, { label: 'x' }, NOW - 2 * MIN);
    write(old, { status: 'open' }, NOW - MIN);
    expect(placedAt(read(old))).toBe(NOW - 60 * MIN);
  });

  it('on a signed-in Mac too, when the one who closed it reopens it', () => {
    setLineAuthor('person-a');
    const old = make('Old thread', NOW - 60 * MIN);
    write(old, { status: 'done' }, NOW - 2 * MIN);
    write(old, { status: 'open' }, NOW - MIN);
    expect(placedAt(read(old))).toBe(NOW - 60 * MIN);
  });

  it('and news after the reopen puts it at the top again', () => {
    const old = make('Old thread', NOW - 60 * MIN);
    write(old, { status: 'done' }, NOW - 3 * MIN);
    write(old, { status: 'open' }, NOW - 2 * MIN);
    write(old, { result: 'An answer.' }, NOW - MIN, 'agent');
    expect(placedAt(read(old))).toBe(NOW - MIN);
  });
});

describe('what still counts as news on the thread', () => {
  it('a reply that reopens it: her words are new', () => {
    const old = make('Old thread', NOW - 60 * MIN);
    write(old, { status: 'done' }, NOW - 3 * MIN);
    write(old, { answer: 'one more thing' }, NOW - 2 * MIN);
    write(old, { status: 'open' }, NOW - 2 * MIN + 1);
    expect(placedAt(read(old))).toBe(NOW - 2 * MIN + 1);
  });

  it('an agent writing between the close and the reopen', () => {
    const old = make('Old thread', NOW - 60 * MIN);
    write(old, { status: 'done' }, NOW - 3 * MIN);
    write(old, { note: 'finished the report' }, NOW - 2 * MIN, 'agent');
    write(old, { status: 'open' }, NOW - MIN);
    expect(placedAt(read(old))).toBe(NOW - MIN);
  });

  it('a reopen by the app or an agent rather than her', () => {
    const old = make('Old thread', NOW - 60 * MIN);
    write(old, { status: 'done' }, NOW - 3 * MIN);
    write(old, { status: 'open' }, NOW - MIN, 'system');
    expect(placedAt(read(old))).toBe(NOW - MIN);
  });

  it('a reopen by someone other than who closed it', () => {
    setLineAuthor('person-a');
    const old = make('Old thread', NOW - 60 * MIN);
    write(old, { status: 'done' }, NOW - 3 * MIN);
    setLineAuthor('person-b');
    write(old, { status: 'open' }, NOW - MIN);
    expect(placedAt(read(old))).toBe(NOW - MIN);
  });

  it('the close itself, and Done still runs by when it was finished', () => {
    const old = make('Old thread', NOW - 60 * MIN);
    write(old, { status: 'done' }, NOW - MIN);
    expect(placedAt(read(old))).toBe(NOW - MIN);
    expect(read(old).wrote.status.ts).toBe(NOW - MIN);
  });

  it('carries nothing of the bookkeeping out on the row', () => {
    const old = make('Old thread', NOW - 60 * MIN);
    write(old, { status: 'done' }, NOW - MIN);
    expect(Object.keys(read(old))).not.toContain('closedFrom');
    expect(Object.keys(read(old))).not.toContain('placedAt');
  });
});
