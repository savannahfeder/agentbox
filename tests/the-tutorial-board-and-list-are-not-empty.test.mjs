// THE TUTORIAL'S BOARD AND LIST HAVE SOMETHING ON THEM (w-58c8f466e7, 2026-10-02).
//
// Asked for when B was added to switch between the two: "make sure the
// tutorial pages are filled in because there's no value if we go into the
// board view and there's nothing on the page. The same applies to the list
// view: it's really hard to understand."
//
// MEASURED BEFORE THE CHANGE, off `walkRows` and the rows the walk stages. By
// the tab tour every staged row has been closed (two), put off (one) or
// answered (one), so the board beat's set was those four plus the walk's own
// closed task: Needs you 0, In progress 1, Scheduled 1, Done 3. The list tabs
// held one row each, and the ⌘K beat that follows the board fell back to the
// single closed task, so pressing B on the board card emptied the board one
// frame after it appeared.
//
// WHAT THIS FILE HOLDS. The practice project now also holds five rows of the
// practice team's other work, kept off the screen until the tour. The tour,
// the board and the ⌘K beat show all five; nothing before the tour shows any;
// and each row lands in the column it was written for, by the app's own rules.
//
// AND NOT ONE OF THEM EVER NEEDS YOU (2026-10-24, w-228d7348ca). Two of the
// five were written as rows an agent had finished or stopped a question on, so
// they were held back from the tour, whose card says the inbox is now empty,
// and let through from the board onward. Measured on the QA box: pressing B off
// the board put both back into Needs you one beat after the tour called it
// empty, and the sidebar badge went from nothing back to 2. Reported as "Needs
// you fills up again with new items right after the message". They are the same
// two pieces of work, in states that ask nothing of anybody.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mjs';
import { PRACTICE_BACKDROP, PRACTICE_SLUG } from '../shared/first-run-practice.mjs';
import { threadState } from '../shared/thread-cards.mjs';
import { belongsInInbox } from '../renderer/src/list-rules.ts';
import { START, advance, walkRows } from '../renderer/src/onboarding.ts';

const EXAMPLES = ['w-ex1', 'w-ex2', 'w-ex3', 'w-ex4'];
const BACKDROP = PRACTICE_BACKDROP.map((_, i) => `w-bd${i + 1}`);
const ITEM = 'w-task';
const rows = [...EXAMPLES, ...BACKDROP, ITEM, 'w-directive'].map((id) => ({ id }));
const runAt = (step, extra = {}) => ({
  ...START, step, practice: PRACTICE_SLUG, item: ITEM, examples: EXAMPLES, backdrop: BACKDROP, ...extra,
});
const shown = (step, extra) => walkRows(rows, runAt(step, extra)).map((r) => r.id);
const needs = BACKDROP.filter((_, i) => PRACTICE_BACKDROP[i].state === 'needs');
const rest = BACKDROP.filter((_, i) => PRACTICE_BACKDROP[i].state !== 'needs');

describe('the practice team has other work in every column but Needs you', () => {
  it('is five rows: three being worked on, two scheduled, and none that needs you', () => {
    expect(PRACTICE_BACKDROP.map((r) => r.state).sort())
      .toEqual(['scheduled', 'scheduled', 'working', 'working', 'working']);
    expect(needs).toEqual([]);
  });
});

describe('when it is on the screen', () => {
  it('the board shows all of it, beside what the walk already staged', () => {
    expect(shown('board').sort()).toEqual([...EXAMPLES, ...BACKDROP, ITEM].sort());
  });

  it('the ⌘K beat keeps the board’s set, so pressing B does not empty it', () => {
    expect(shown('command').sort()).toEqual(shown('board').sort());
  });

  it('the tab tour shows all of it, since none of it lands in the inbox the card called empty', () => {
    const tour = shown('where');
    for (const id of rest) expect(tour).toContain(id);
    // No beat sifts the backdrop any more. Sifting is what let the ⌘K beat
    // show rows the tour had hidden, which is how the inbox refilled.
    expect(tour.sort()).toEqual(shown('board').sort());
  });

  // THE WORK BEING DONE AND THE WORK PUT OFF ARE THERE FROM THE LOOK AROUND
  // SINCE 2026-10-06, whose second stop says "In progress is agents at work"
  // and has to have some to point at. They are never in Needs you, so the
  // beats that are about the inbox still see only their own rows there.
  it('before the tour, shows the running and scheduled work and never the rows that need you', () => {
    for (const step of ['tour', 'tabs', 'make', 'task', 'working', 'open', 'answer', 'clear', 'snooze', 'unblock']) {
      for (const id of needs) expect(shown(step), step).not.toContain(id);
      for (const id of rest) expect(shown(step), step).toContain(id);
    }
    // And nothing at all before the practice project exists.
    for (const id of BACKDROP) expect(shown('hand')).not.toContain(id);
  });

  // THE CASE THAT MUST NOT MATCH, one level down from the sifting: a result is
  // what puts a row back in the inbox, so a backdrop row written with one would
  // refill Needs you however carefully the beats were filtered.
  it('and no backdrop row is written with a result for the inbox to pick up', () => {
    for (const row of PRACTICE_BACKDROP) expect(row.result).toBeUndefined();
  });

  it('the finish card still stands over an empty inbox', () => {
    expect(shown('done')).toEqual([]);
  });

  it('a walk saved before this existed draws what it drew before', () => {
    expect(shown('board', { backdrop: undefined }).sort()).toEqual([...EXAMPLES, ITEM].sort());
  });

  it('the project’s own directive stays out throughout', () => {
    for (const step of ['where', 'board', 'command']) expect(shown(step)).not.toContain('w-directive');
  });
});

describe('the walk remembers it', () => {
  it('from the moment the practice project is made', () => {
    const run = advance({ ...START, step: 'hand' }, { t: 'practice', product: PRACTICE_SLUG, examples: EXAMPLES, backdrop: BACKDROP });
    expect(run.backdrop).toEqual(BACKDROP);
  });

  it('and as none when the practice project came back without it', () => {
    const run = advance({ ...START, step: 'hand' }, { t: 'practice', product: PRACTICE_SLUG, examples: EXAMPLES });
    expect(run.backdrop).toEqual([]);
  });
});

describe('each row lands in its column by the app’s own rules', () => {
  it('needs you, in progress and scheduled, read off the rows the store wrote', async () => {
    const account = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-backdrop-'));
    process.env.ASTRAL_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-backdrop-home-'));
    const store = new Store({ accountRoot: account, products: [], personalProducts: [] });
    await store.init();
    store.watch = () => {};
    const { slug } = store.createPractice();
    const now = Date.now();
    const { ids } = store.stagePracticeBackdrop(slug, { now });
    expect(ids).toHaveLength(PRACTICE_BACKDROP.length);
    const byId = new Map(store.listItems().filter((i) => i.product === slug).map((i) => [i.id, i]));
    const word = { needs: 'waiting', working: 'running', scheduled: 'scheduled' };
    PRACTICE_BACKDROP.forEach((row, i) => {
      const item = byId.get(ids[i]);
      expect(item.title).toBe(row.title);
      expect(threadState(item, now)).toBe(word[row.state]);
      // AND THE INBOX HOLDS NONE OF THEM, on the day it is staged and on any
      // day after it: the scheduled pair come back on their own morning, and
      // the inbox the tutorial empties stays empty until then.
      expect(belongsInInbox(item, { now })).toBe(false);
      expect(belongsInInbox(item, { now: now + 60_000 })).toBe(false);
      // Never spawned: every practice row carries the walk's own mark.
      expect(item.labels).toContain('first-run');
    });
  });
});
