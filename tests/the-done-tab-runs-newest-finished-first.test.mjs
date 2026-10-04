// THE DONE TAB RUNS NEWEST FINISHED FIRST, WHATEVER THE SORT SAYS.
//
// Reported 2026-10-02 (w-c61f5bf497) with a picture of the Done tab under
// Sort by Priority: a wall of Urgent rows, "1 hour ago" and "Yesterday" and
// "Sep 30" in whatever order priority left them. "It's not logical for this to
// be ordered by priority." Done is a record of what happened, so it reads as a
// history: the thread finished last is on top.
//
// AND THE CLOCK IS WHEN IT WAS FINISHED, NOT WHEN IT WAS LAST TOUCHED. Measured
// on a real store the same day: of 734 finished threads, 724 were last touched
// at the moment they were marked done, but 8 were touched more than a day later
// (a label, a late note). Sorting Done by Updated would float those 8 to the
// top as if they had just finished. The fold already records when the status
// was written (`wrote.status.ts`), so that is the time Done sorts and shows.
//
// A teammate's card carries no such time, only when it last changed, so it
// falls back to that; so does any row without one.
//
// The other tabs keep the Display's sort: this is about Done, not about the menu.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sorted, sortedEntries, finishedAt, timeHeading } from '../renderer/src/threads/page-rules.ts';
import { mergeRows } from '../renderer/src/threads/people-rules.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, '..', 'renderer', 'src', ...p), 'utf8');

const NOW = Date.UTC(2026, 9, 2, 17);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const byPriority = { view: 'list', sort: 'priority', priorities: [], projects: [], updated: 'any' };
const byUpdated = { ...byPriority, sort: 'updated' };
// A finished thread: when it was marked done, and when anything last touched it.
const done = (id, priority, doneAgo, touchedAgo = doneAgo) => ({
  id, priority, product: 'northwind', status: 'done',
  updatedAt: NOW - touchedAgo, wrote: { status: { ts: NOW - doneAgo, source: 'founder' } },
});
const ids = (list) => list.map((r) => r.id);

describe('the Done tab, under Sort by Priority', () => {
  const rows = [done('urgent-old', 9, 2 * DAY), done('low-new', 1, HOUR), done('high-mid', 7, DAY)];
  it('runs newest finished first, not Urgent first', () => {
    expect(ids(sorted(rows, byPriority, 'done'))).toEqual(['low-new', 'high-mid', 'urgent-old']);
  });
  it('and the same under Sort by Updated', () => {
    expect(ids(sorted(rows, byUpdated, 'done'))).toEqual(['low-new', 'high-mid', 'urgent-old']);
  });
});

describe('the clock is when it was finished', () => {
  // Finished two days ago, then labelled an hour ago.
  const late = done('touched-later', 5, 2 * DAY, HOUR);
  const fresh = done('finished-today', 5, 3 * HOUR);
  it('a thread touched after it finished stays where it finished', () => {
    expect(ids(sorted([late, fresh], byUpdated, 'done'))).toEqual(['finished-today', 'touched-later']);
  });
  it('finishedAt reads the moment the status was written', () => {
    expect(finishedAt(late)).toBe(NOW - 2 * DAY);
  });
  it('a row with no record of that falls back to when it last changed', () => {
    const bare = { id: 'bare', status: 'done', updatedAt: NOW - HOUR };
    expect(finishedAt(bare)).toBe(NOW - HOUR);
  });
  it('a reopened thread is not finished, so its time is when it last changed', () => {
    const reopened = { id: 'again', status: 'open', updatedAt: NOW - HOUR, wrote: { status: { ts: NOW - 2 * HOUR } } };
    expect(finishedAt(reopened)).toBe(NOW - HOUR);
  });
});

describe('every other tab keeps the sort you chose', () => {
  const rows = [done('urgent-old', 9, 2 * DAY), done('low-new', 1, HOUR)];
  for (const tab of ['inbox', 'progress', 'snoozed', 'all', undefined]) {
    it(`${tab ?? 'no tab'} under Priority is still Urgent first`, () => {
      expect(ids(sorted(rows, byPriority, tab))).toEqual(['urgent-old', 'low-new']);
    });
  }
});

describe('the rows the app makes itself stay on top of Done too', () => {
  it('a row with no project leads', () => {
    const trouble = { id: 'trouble', product: '', priority: 0, updatedAt: NOW - 5 * DAY };
    expect(ids(sorted([done('a', 1, HOUR), trouble], byPriority, 'done'))).toEqual(['trouble', 'a']);
  });
});

describe('a teammate’s finished thread falls in by the same clock', () => {
  const mineNew = done('mine-new', 1, HOUR);
  const mineOld = done('mine-old', 9, 2 * DAY, 10 * 60_000); // touched ten minutes ago
  const theirs = { threadId: 'theirs', priority: 9, updatedAt: NOW - DAY };
  const keys = (rows) => rows.map((r) => (r.item ? r.item.id : r.card.threadId));
  it('between yours, by when each finished', () => {
    expect(keys(mergeRows([mineNew, mineOld], [theirs], 'done'))).toEqual(['mine-new', 'theirs', 'mine-old']);
  });
});

describe('the board’s Done column', () => {
  const entry = (key, priority, item) => ({ key, priority, updatedAt: item.updatedAt, item, card: null, state: 'done' });
  const a = entry('urgent-early', 9, done('urgent-early', 9, 5 * HOUR, 10 * 60_000));
  const b = entry('low-late', 1, done('low-late', 1, HOUR));
  it('runs newest finished first under Priority', () => {
    expect(sortedEntries([a, b], byPriority, 'done').map((e) => e.key)).toEqual(['low-late', 'urgent-early']);
  });
  it('and every other column keeps Priority', () => {
    expect(sortedEntries([b, a], byPriority, 'waiting').map((e) => e.key)).toEqual(['urgent-early', 'low-late']);
  });
});

describe('what the page says', () => {
  it('the time column is headed Done on the Done tab', () => expect(timeHeading('done')).toBe('Done'));
  it('and Updated everywhere else', () => {
    for (const tab of ['inbox', 'progress', 'snoozed', 'all']) expect(timeHeading(tab)).toBe('Updated');
  });
  it('the app hands the tab to the sorter, for your rows and for the merge', () => {
    const app = src('App.tsx');
    // Your project order rides after the tab since w-e263a8a0fb.
    expect(app).toMatch(/sortedByDisplay\([^;]*inboxDisplay, view[,)]/);
    expect(app).toMatch(/mergeRows\(displayedBox, theirRows, view === 'done' \? 'done' : inboxDisplay\.sort[,)]/);
  });
  it('the Display menu says Done keeps its own order while you are on it', () => {
    expect(src('threads', 'Pages.tsx')).toMatch(/Done runs newest first/);
  });
});
