// IN PROGRESS COUNTS WHAT THE BOARD COUNTS.
//
// Measured on the Linux QA box on 2026-10-25 with four threads asking a
// question and two queued behind a full computer: the list read IN PROGRESS 6
// and the board read NEEDS YOU 4 and IN PROGRESS 2 for those same six threads.
// The four asking ones were counted in both of the list's tabs, so the one
// number the cloud offer is about — how many threads are really running — was
// on neither screen.
//
// The board never had the fault: a card sits in one column, the one `tabState`
// gives it, and Needs you wins there. The lists are the copy that drifted.
// `done` already subtracts Needs you in App.tsx; In progress did not.
//
// The rules underneath do not move. A session really is on a row that is
// asking you something, so it stays In progress for everything that reads
// `belongsInProgress`: it is stoppable, and the thread pane still says so
// (tests/a-running-agent-cannot-hide-its-own-unanswered-question). Only the
// tab that counts it moves, to Needs you, which is the one list a person
// reads.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { belongsInInbox, belongsInProgress, inProgressTab, stillAsksYou } from '../renderer/src/list-rules';

const NOW = 1_791_800_000_000;

// Your own thread, with its agent stopped on a permission card: the four
// ASKING rows on the reported screen. The card is what Needs you reads
// (`asking`, App.tsx), and the session on it is what In progress reads.
const asking = (id) => ({
  id, status: 'claimed', kind: 'directive', labels: ['founder'],
  title: 'Truncate function and unit test', updatedAt: NOW - 60_000,
  wrote: { body: { ts: NOW - 300_000, source: 'founder' } },
});
// Your own thread waiting for a free agent: the two QUEUED rows.
const queued = (id) => ({
  id, status: 'open', kind: 'directive', labels: ['founder'],
  title: 'Add a repeat(str, n) function to src with a unit test.', updatedAt: NOW - 1000,
  wrote: { body: { ts: NOW - 1000, source: 'founder' } },
});
// An agent's question to you, the other way a row is in both rules at once.
const question = (id) => ({
  id, status: 'claimed', kind: 'question', labels: [], parent: 'w-parent',
  title: 'Which of these two should I build first?', updatedAt: NOW - 60_000,
  wrote: { title: { ts: NOW - 300_000, source: 'agent' } },
});

// The two lists App.tsx and the phone build, off the exported rules.
function tabs(items, { live = new Set(), cards = new Set() } = {}) {
  const inbox = items.filter((i) => belongsInInbox(i, { now: NOW, live: live.has(i.id), asking: cards.has(i.id) }));
  const progress = items.filter((i) => belongsInProgress(i, { now: NOW, live: live.has(i.id) }));
  return { inbox: inbox.map((i) => i.id), progress: inProgressTab(progress, inbox).map((i) => i.id) };
}

describe('the thread counts the two views show', () => {
  it('the reported screen: four asking and two queued read 4 and 2 in both views', () => {
    const ids = ['w-a1', 'w-a2', 'w-a3', 'w-a4'];
    const items = [...ids.map(asking), queued('w-q1'), queued('w-q2')];
    const on = new Set(ids);
    expect(tabs(items, { live: on, cards: on })).toEqual({ inbox: ids, progress: ['w-q1', 'w-q2'] });
  });

  it('an agent\'s question is counted once too, with or without a session on it', () => {
    // 179 rows in the real store had been claimed while still asking
    // something, so a question was in both lists long before a live session
    // could hold one there.
    expect(tabs([question('w-q'), queued('w-q1')])).toEqual({ inbox: ['w-q'], progress: ['w-q1'] });
    expect(tabs([question('w-q')], { live: new Set(['w-q']) })).toEqual({ inbox: ['w-q'], progress: [] });
  });

  it('the boundary: once you answer it, the same thread is In progress and nowhere else', () => {
    const answered = { ...question('w-q'), answer: 'The first one' };
    expect(stillAsksYou(answered)).toBe(false);
    expect(tabs([answered], { live: new Set(['w-q']) })).toEqual({ inbox: [], progress: ['w-q'] });
  });

  it('what must not move: a thread nobody is asking you about stays In progress', () => {
    const working = { ...queued('w-q1'), status: 'claimed' };
    expect(tabs([working], { live: new Set(['w-q1']) })).toEqual({ inbox: [], progress: ['w-q1'] });
  });

  it('counts nothing twice even where Needs you holds a thread for another reason', () => {
    // An agent parked this one: nothing will start it again, so Needs you has
    // it. In progress promises a worker is coming, and must not claim it.
    const parked = { ...queued('w-q1'), runAt: NOW + 60_000, wrote: { ...queued('w-q1').wrote, runAt: { ts: NOW, source: 'agent' } } };
    const t = tabs([parked]);
    expect(t.inbox).toEqual(['w-q1']);
    expect(t.progress).toEqual([]);
  });
});

describe('both screens read the one rule', () => {
  const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

  it('the desktop tab and the phone tab are the same subtraction, not two copies', () => {
    expect(read('renderer/src/App.tsx')).toMatch(/inProgressTab\(/);
    expect(read('mobile/src/lib/tabs.ts')).toMatch(/inProgressTab\(/);
  });
});
