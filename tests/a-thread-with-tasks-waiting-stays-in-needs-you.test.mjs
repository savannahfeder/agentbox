// A THREAD WITH TASKS STILL WAITING FOR A YES STAYS IN NEEDS YOU, EVEN WHILE
// ANOTHER OF ITS TASKS RUNS (w-d2744c6daa).
//
// Measured by driving the built app, 2026-10-08: a thread that filed three
// tasks, one approved and two waiting. The approved one went to In progress,
// and `threadMasked` then hid the thread from Needs you behind it, because a
// row is hidden while a descendant of it is live. The two waiting tasks sat in
// Later, under a thread that was in no list she reads: the exact way a filed
// task gets missed, which is the whole of this item ("I often miss these filed
// tasks from this thread that need my review").
//
// So a thread with a proposal still waiting under it is the one row the mask
// leaves alone. Only a WAITING proposal holds it: once every task is approved
// or dropped, the mask applies exactly as before.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { proposingThreads } from '../renderer/src/list-rules.ts';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const kid = (id, over = {}) => ({ id, parent: 'w-a', product: 'p', status: 'open', kind: 'task', labels: [], ...over });

describe('which threads have a task waiting for a yes under them', () => {
  it('names a thread with one waiting proposal, by project and id', () => {
    expect([...proposingThreads([kid('w-1')])]).toEqual(['p/w-a']);
  });

  it('still names it with one running beside the one waiting', () => {
    const set = proposingThreads([kid('w-1', { answer: 'Approved. Run it.' }), kid('w-2')]);
    expect(set.has('p/w-a')).toBe(true);
  });

  it('does not name it once every task under it has its answer', () => {
    const set = proposingThreads([kid('w-1', { answer: 'Approved. Run it.' }), kid('w-2', { status: 'done' })]);
    expect(set.has('p/w-a')).toBe(false);
  });

  it('does not count a review or a question, which reach the inbox on their own', () => {
    expect(proposingThreads([kid('w-1', { kind: 'review' }), kid('w-2', { kind: 'question' })]).size).toBe(0);
  });

  it('does not count a thread you wrote yourself under another', () => {
    expect(proposingThreads([kid('w-1', { labels: ['founder'] })]).size).toBe(0);
  });

  it('keeps the same id in two projects apart', () => {
    const set = proposingThreads([kid('w-1', { product: 'q' })]);
    expect(set.has('q/w-a')).toBe(true);
    expect(set.has('p/w-a')).toBe(false);
  });
});

describe('where the inbox uses it', () => {
  const app = read('renderer/src/App.tsx');

  it('leaves a thread with a task waiting out of the mask, and nothing else', () => {
    expect(app).toMatch(/const proposing = proposingThreads\(items\);/);
    expect(app).toMatch(/masked\.has\(i\.id\) && !proposing\.has\(`\$\{i\.product\}\/\$\{i\.id\}`\)/);
  });
});
