// A TASK SAYS ONE STATE, THE SAME ON THE LIST, THE BOARD AND IN NEEDS YOU.
//
// Dev: the double-booking task read "FROM MAYA" on the Board while
// the list said "BLOCKED ON MAYA", and once blocked it moved to Later with no
// word. Maya set "Blocked by: you" on the same task and it went to her Later as
// "DEV WROTE BACK", not to her Needs you. Measured on the rules: the board's
// entry took `taskWords`, which knew nothing of blocks, while the row worked
// the block out itself; `waitsInLater` was true for any task with a block set
// by a person; and `inMyInbox` never looked at a block at all.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { taskWords } from '../renderer/src/team/company.ts';
import { teamEntries } from '../renderer/src/threads/page-rules.ts';
import { waitsInLater } from '../renderer/src/list-rules.ts';
import { inMyInbox } from '../shared/team-rules.mts';

const MAYA = 'p-maya';
const DEV = 'p-dev';
const names = { [MAYA]: 'Maya', [DEV]: 'Dev' };
const nameOf = (id) => names[id] ?? 'Someone';
const product = { slug: 'direct-md', name: 'Maya and Dev', team: { projectId: 'pr', direct: true, people: [MAYA, DEV] } };

/** Maya gave Dev the fix; Dev wrote back; then someone set what blocks it. */
const task = (over = {}) => ({
  id: 't1', product: product.slug, title: 'Fix double booking', labels: ['given-task'], kind: 'directive',
  assignee: DEV, people: [MAYA, DEV], createdBy: MAYA, status: 'open', priority: 0,
  createdAt: 50, updatedAt: 120, answer: 'I need Jordan’s answers first.',
  talk: { chat: [{ by: MAYA, ts: 50, text: 'Fix double booking' }, { by: DEV, ts: 80, text: 'I need Jordan’s answers first.' }] },
  wrote: { body: { by: MAYA, ts: 50 }, answer: { by: DEV, ts: 80 } },
  ...over,
});
const blockedOnMaya = (by = DEV, ts = 100) => ({ blockedBy: [`person:${MAYA}`], wrote: { body: { by: MAYA, ts: 50 }, answer: { by: DEV, ts: 80 }, blockedBy: { by, ts, source: 'founder' } } });
const ctx = { items: [], cards: [] };

describe('the holder, Dev', () => {
  it('a task blocked on Maya says so, held, with whom', () => {
    const w = taskWords(task(blockedOnMaya()), product, DEV, nameOf, false, ctx);
    expect(w.word).toBe('Blocked on Maya');
    expect(w.held).toBe(true);
  });
  it('the board says the same word as the list', () => {
    const item = task(blockedOnMaya());
    const [entry] = teamEntries({ items: [item], products: [product], cards: [], me: DEV, now: 200, stateOf: () => 'running', allMine: true, nameOf });
    expect(entry.task.word).toBe(taskWords(item, product, DEV, nameOf, false, ctx).word);
    expect(entry.task.word).toBe('Blocked on Maya');
  });
  it('new words from Maya still lead: they are news, the block is not', () => {
    const item = task({ ...blockedOnMaya(), answer: 'Asked him tonight.', talk: { chat: [...task().talk.chat, { by: MAYA, ts: 150, text: 'Asked him tonight.' }] }, wrote: { ...blockedOnMaya().wrote, answer: { by: MAYA, ts: 150 } } });
    const w = taskWords(item, product, DEV, nameOf, true, ctx);
    expect(w.word).toBe('Maya wrote back');
    expect(w.unread).toBe(true);
  });
  it('a finished task says Done whatever blocked it', () => {
    expect(taskWords(task({ ...blockedOnMaya(), status: 'done' }), product, DEV, nameOf, false, ctx).word).toBe('Done');
  });
  it('without a block it is his, as before', () => {
    const w = taskWords(task(), product, DEV, nameOf, false, ctx);
    expect(w.word).toBe('You have this');
    expect(w.held).toBeFalsy();
  });
  it('a blocked task is never put in Later, where nobody reads it', () => {
    expect(waitsInLater(task(blockedOnMaya()), [])).toBe(false);
  });
  it('a thread of his own that waits on Maya still goes to Later', () => {
    const thread = { id: 'w1', product: 'lumen', title: 'Restyle', labels: [], status: 'blocked', blockedBy: [`person:${MAYA}`], wrote: { blockedBy: { by: DEV, ts: 100, source: 'founder' } } };
    expect(waitsInLater(thread, [])).toBe(true);
  });
});

describe('the blocker, Maya', () => {
  it('a task blocked on her is in her Needs you and says Blocked on you', () => {
    const item = task({ ...blockedOnMaya(MAYA, 100), talk: { chat: [...task().talk.chat, { by: MAYA, ts: 90, text: 'I will get Jordan’s answers.' }] } });
    expect(inMyInbox(item, product, MAYA, 200)).toBe(true);
    expect(taskWords(item, product, MAYA, nameOf, true, ctx).word).toBe('Blocked on you');
  });
  it('once she writes after the block was set, it waits on Dev again', () => {
    const item = task({ ...blockedOnMaya(MAYA, 100), talk: { chat: [...task().talk.chat, { by: MAYA, ts: 130, text: 'Here they are.' }] } });
    expect(inMyInbox(item, product, MAYA, 200)).toBe(false);
  });
  it('a task blocked on someone else is not hers to act on', () => {
    const item = task({ blockedBy: [`person:p-sofia`], wrote: { ...blockedOnMaya().wrote }, talk: { chat: [...task().talk.chat, { by: MAYA, ts: 90, text: 'Thanks.' }] } });
    expect(inMyInbox(item, product, MAYA, 200)).toBe(false);
  });
});

it('the row draws the state taskWords gives, not a block of its own', () => {
  const pages = fs.readFileSync(new URL('../renderer/src/threads/Pages.tsx', import.meta.url), 'utf8');
  const row = pages.slice(pages.indexOf('const task = taskWords('), pages.indexOf('if (said) {'));
  expect(row).not.toMatch(/blockedWords\(/);
  expect(row).toMatch(/task\.held/);
});
