// THE INBOX SAYS HOW MANY TASKS A THREAD HAS WAITING FOR A YES (w-d2744c6daa).
//
// A thread whose agent filed tasks looked like any other row in the inbox, so
// the tasks under it were only found by opening it, and were missed: one waited
// 22 hours under a closed thread (measured on the real store, 2026-10-07).
//
// The row now says "2 tasks to approve" in the same faint words a repeating
// task uses for its schedule (`.th-aside`): "be more inspired by what already
// exists... a little bit of text that gives you extra information if you need
// to know." No dot, no box, no opening the row in place.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { toApproveWords, waitingCounts } from '../renderer/src/threads-made.ts';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const kid = (id, parent, over = {}) => ({ id, parent, product: 'p', status: 'open', kind: 'task', labels: [], createdAt: 1, ...over });

describe('the words', () => {
  it('says nothing for none', () => expect(toApproveWords(0)).toBe(''));
  it('says one task for one', () => expect(toApproveWords(1)).toBe('1 task to approve'));
  it('says tasks for more', () => expect(toApproveWords(2)).toBe('2 tasks to approve'));
});

describe('which tasks count', () => {
  const items = [
    { id: 'w-a', product: 'p', status: 'open', kind: 'directive', labels: ['founder'] },
    kid('w-1', 'w-a'),
    kid('w-2', 'w-a'),
    kid('w-3', 'w-a', { answer: 'Approved. Run it.' }),
    kid('w-4', 'w-a', { kind: 'review' }),
    kid('w-5', 'w-b'),
    kid('w-6', 'w-a', { product: 'q' }),
  ];
  const counts = waitingCounts(items, () => 'scheduled');

  it('counts the tasks under a thread still waiting for a yes', () => {
    expect(counts.get('p/w-a')).toBe(2);
  });

  it('does not count one already approved, or a review, which is its own row', () => {
    expect(counts.get('p/w-a')).not.toBe(4);
  });

  it('counts a task under the thread of the same id in its own project, never another', () => {
    // w-6 is in project q: it is not one of p/w-a's two.
    expect(counts.get('p/w-a')).toBe(2);
    expect(counts.get('q/w-a')).toBe(1);
    expect(counts.get('p/w-b')).toBe(1);
  });

  it('counts nothing that the tabs already say is moving', () => {
    expect(waitingCounts(items, () => 'running').size).toBe(0);
  });
});

describe('where the words are drawn', () => {
  const pages = read('renderer/src/threads/Pages.tsx');
  const app = read('renderer/src/App.tsx');

  it('rides the faint words after the title that a repeating task uses', () => {
    expect(pages).toMatch(/aside=\{toApproveWords\(/);
  });

  it('is handed the counts from the app, worked out once for the whole list', () => {
    expect(pages).toMatch(/export const WaitingContext = createContext/);
    expect(app).toMatch(/<WaitingContext\.Provider value=\{waitingByThread\}>/);
  });
});
