// A THREAD STARTED FROM A GIVEN TASK SAYS WHO GAVE IT (2026-11-20).
//
// Synthetic team run: Lena took the thread Priya handed her and put an agent
// on it. In progress then showed "Empty state mockups for bookings list" (the
// task, with Priya's face) and "Bookings list empty state mockups" (the
// thread it started) one above the other, and nothing on the second said it
// came from Priya. A thread started from a task carries
// `handed-from:<project>:<task>`, and one moved when someone left the team
// `handed-from:<person>`; its row now leads with that person's face and name.
// Measured on the rule and on the row as Pages draws it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { givenBy } from '../renderer/src/threads/page-rules.ts';
import { handedFromLabel } from '../renderer/src/threads/composer-rules.ts';

const task = { id: 'w-task', product: 'dm-1', title: 'Empty state mockups for bookings list', labels: ['founder', 'given-task'], assignee: 'p-lena', people: ['p-priya', 'p-lena'], createdBy: 'p-priya' };
const thread = (labels: string[]) => ({ id: 'w-new', product: 'web', title: 'Bookings list empty state mockups', labels: ['founder', ...labels] });

describe('who a thread of yours came from', () => {
  it('the giver of the task it was started from', () => {
    expect(givenBy(thread([handedFromLabel('dm-1', 'w-task')]), [task], 'p-lena')).toBe('p-priya');
  });
  it('the person who left, for a thread moved to you then', () => {
    expect(givenBy(thread(['handed-from:p-priya']), [], 'p-lena')).toBe('p-priya');
  });
  it('nobody for a thread you started yourself, a task that is gone, or one you gave', () => {
    expect(givenBy(thread([]), [task], 'p-lena')).toBeNull();
    expect(givenBy(thread([handedFromLabel('dm-1', 'w-gone')]), [task], 'p-lena')).toBeNull();
    expect(givenBy(thread([handedFromLabel('dm-1', 'w-task')]), [task], 'p-priya')).toBeNull();
  });
  it('nobody when the label points at a thread that is not a task', () => {
    expect(givenBy(thread([handedFromLabel('web', 'w-chat')]), [{ id: 'w-chat', product: 'web', labels: ['founder'], createdBy: 'p-priya' }], 'p-lena')).toBeNull();
  });
});

describe('the row', () => {
  it('leads with the giver', () => {
    const pages = fs.readFileSync(new URL('../renderer/src/threads/Pages.tsx', import.meta.url), 'utf8');
    expect(pages).toContain('const from = handed?.from ?? (team ? givenBy(item, allItems ?? [], team.me) : null);');
  });
});
