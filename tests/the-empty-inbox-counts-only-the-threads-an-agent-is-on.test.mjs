// "8 THREADS ARE RUNNING" OVER FOUR THREADS AND FOUR QUEUES.
//
// A tester cleared their inbox with the fleet set to two agents at once
// (power test run 1, issue 3). The empty page read "8 threads are running",
// and four of the eight had not started: `InboxClear` was handed
// `progress.length`, and the In progress tab holds a thread waiting its turn
// as well as one being worked on. They only found out by opening search, and
// then by finding the capacity setting on their own.
//
// So the line counts what it says: a live session, a ship the app still owes,
// or one of your own terminal sessions that took your reply. A thread waiting
// its turn is counted separately and said in the words the thread itself uses
// ("Queued. An agent starts on it as soon as one is free"), and only for the
// ids the supervisor says a tick will start, so nothing stuck at a sign-in or
// a usage limit is counted as about to run.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workMoving } from '../renderer/src/list-rules.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, '..', 'renderer', 'src', ...p), 'utf8');
const app = src('App.tsx');
const pages = src('threads', 'Pages.tsx');

const sets = ({ live = [], shipping = [], queued = [] } = {}) => ({
  live: new Set(live), shipping: new Set(shipping), queued: new Set(queued),
});
const rows = (...ids) => ids.map((id) => ({ id }));

describe('what the empty inbox counts as running', () => {
  it('counts a thread a session is on', () => {
    expect(workMoving(rows('w-1', 'w-2'), sets({ live: ['w-1', 'w-2'] })).running).toBe(2);
  });

  it('does not count a thread waiting its turn', () => {
    const counts = workMoving(rows('w-1', 'w-2', 'w-3', 'w-4'), sets({ live: ['w-1'], queued: ['w-2', 'w-3'] }));
    expect(counts.running).toBe(1);
    expect(counts.queued).toBe(2);
  });

  it('counts a thread the app still owes a ship, since that is moving without you too', () => {
    expect(workMoving(rows('w-1'), sets({ shipping: ['w-1'] })).running).toBe(1);
  });

  it('counts one of your own terminal sessions that took your reply', () => {
    expect(workMoving([{ id: 'agent:412', agent: { pid: 412 } }], sets()).running).toBe(1);
  });

  it('counts a thread nothing is doing and nothing will start as neither', () => {
    // Stuck at a sign-in, at a usage limit, or stopped: In progress holds it,
    // the supervisor's queued list does not, and neither number may claim it.
    const counts = workMoving(rows('w-stuck'), sets());
    expect(counts).toEqual({ running: 0, queued: 0 });
  });

  it('never counts the same thread twice', () => {
    expect(workMoving(rows('w-1'), sets({ live: ['w-1'], shipping: ['w-1'], queued: ['w-1'] })))
      .toEqual({ running: 1, queued: 0 });
  });
});

describe('the line the empty page draws', () => {
  const block = pages.slice(pages.indexOf('export function InboxClear'), pages.indexOf('export function FilteredEmpty'));

  it('says what is running and what is waiting its turn, and the running half first', () => {
    expect(block).toContain('thread is running');
    expect(block).toContain('thread is queued');
    expect(block.indexOf('thread is running')).toBeLessThan(block.indexOf('thread is queued'));
  });

  it('says of a queued thread what the thread itself says', () => {
    expect(block).toContain('An agent starts on ');
    expect(block).toContain('as soon as one is free');
    // "4 threads are queued. An agent starts on each as soon as one is free."
    expect(block).toContain("queued === 1 ? 'it' : 'each'");
  });

  it('is handed the counted numbers rather than the length of the tab', () => {
    const drawn = app.slice(app.indexOf('<InboxClear'), app.indexOf('<InboxClear') + 300);
    expect(drawn).toContain('running={moving.running}');
    expect(drawn).toContain('queued={moving.queued}');
    expect(drawn).not.toContain('running={progress.length}');
  });

  it('counts with the rule, and off the supervisor\'s own queued list', () => {
    const where = app.indexOf('const moving = useMemo');
    expect(where).toBeGreaterThan(-1);
    const memo = app.slice(where, where + 400);
    expect(memo).toContain('workMoving(progress');
    expect(memo).toContain('queuedIds');
  });
});
