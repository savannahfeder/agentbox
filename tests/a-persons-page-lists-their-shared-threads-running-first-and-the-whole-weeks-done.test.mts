// A PERSON'S PAGE LISTS THEIR SHARED THREADS, RUNNING FIRST, AND THE WHOLE WEEK'S DONE
// (synthetic team, 2026-11-20).
//
// A junior engineer opened the senior engineer's page to read what his agents
// did yesterday and found only a chat box. At that moment he had shared
// nothing yet (his threads predated his sharing), but the page could not have
// shown yesterday's work anyway: its "Done this week" list was built from the
// cards the app keeps for today, so anything finished before midnight was gone.
// And "In progress" put a waiting thread above a running one if it moved last.
// Measured on personThreads, which the page now draws from the week's cards.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { personThreads } from '../renderer/src/team/everything/place.ts';

const DAY = 24 * 3600_000;
const now = 20 * DAY + 10 * 3600_000;
const card = (threadId: string, o: { personId?: string; state?: string; updatedAt?: number; visible?: boolean; title?: string | null } = {}) => ({
  personId: 'theo', threadId, visible: true, title: threadId, state: 'running', updatedAt: now - 60_000, ...o,
});

describe('a person’s threads', () => {
  const cards = [
    card('waiting-new', { state: 'waiting', updatedAt: now - 1000 }),
    card('running-old', { state: 'running', updatedAt: now - 3 * 3600_000 }),
    card('running-new', { state: 'running', updatedAt: now - 2000 }),
    card('done-yesterday', { state: 'done', updatedAt: now - DAY }),
    card('done-six-days', { state: 'done', updatedAt: now - 6 * DAY }),
    card('done-eight-days', { state: 'done', updatedAt: now - 8 * DAY }),
    card('lenas', { personId: 'lena' }),
    card('private', { visible: false }),
  ];
  const t = personThreads(cards, 'theo', { now });

  it('running first, newest first, then the rest of what is under way', () => {
    expect(t.now.map((c) => c.threadId)).toEqual(['running-new', 'running-old', 'waiting-new']);
  });
  it('what they finished yesterday and earlier this week', () => {
    expect(t.finished.map((c) => c.threadId)).toEqual(['done-yesterday', 'done-six-days']);
  });
  it('not what finished more than a week ago', () => {
    expect(t.finished.map((c) => c.threadId)).not.toContain('done-eight-days');
  });
  it('only theirs, and only what they let you read', () => {
    const all = [...t.now, ...t.finished].map((c) => c.threadId);
    expect(all).not.toContain('lenas');
    expect(all).not.toContain('private');
  });
  it('leaves out what is already listed elsewhere on the page', () => {
    const skip = new Set(['running-new', 'done-yesterday']);
    const less = personThreads(cards, 'theo', { now, skip: (c) => skip.has(c.threadId) });
    expect([...less.now, ...less.finished].map((c) => c.threadId)).toEqual(['running-old', 'waiting-new', 'done-six-days']);
  });
});

describe('the page', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  it('draws from the week’s cards, not only today’s', () => {
    expect(app).toMatch(/const theirs = personThreads\(weekCards, id, /);
  });
});
