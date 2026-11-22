// A THREAD FOUND BY ⌘K SAYS WHAT IT IS AND WHEN. Its icon, which says what
// list it is in, is a-thread-in-search-wears-the-icon-of-the-list-it-sits-in.
//
// A tester searched "checkout" and got two rows reading "Prototype checkout
// screen page · Web app", one from Nov 16 and one queued that morning, with
// nothing to tell them apart. The person's own search showed six rows all
// ending "Agentbox Team". They asked for the thread's description under its
// title "or anything they might be querying", its age on every row, and
// finished threads dimmed. Measured on the built app with two same-named
// fixture threads: both rows drew the title and the project, nothing else.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { threadResult } from '../renderer/src/palette-rows';

const NOW = new Date(2026, 10, 20, 12, 0).getTime();
const min = 60_000;
const thread = (more: Record<string, unknown> = {}) => ({
  id: 'w-1', product: 'web', title: 'Prototype checkout screen page', status: 'open',
  createdAt: NOW - 30 * min, updatedAt: NOW - 5 * min, ...more,
});

describe('a thread found by search', () => {
  it('says what it is under its title, from the sentence the words were found in', () => {
    expect(threadResult(thread(), { summary: 'Built the checkout page with Pay now.', project: 'Web app', now: NOW }).sub)
      .toBe('Built the checkout page with Pay now.');
  });

  it('names its project and its age on the right', () => {
    expect(threadResult(thread(), { summary: '', project: 'Web app', now: NOW }).hint).toBe('Web app · 5 min');
    expect(threadResult(thread({ updatedAt: NOW - 3 * 60 * min }), { summary: '', project: 'Web app', now: NOW }).hint).toBe('Web app · 3 hr');
  });

  it('gives a date, not a count of days, once it is a day old', () => {
    const old = thread({ updatedAt: new Date(2026, 10, 16, 9, 0).getTime() });
    expect(threadResult(old, { summary: '', project: 'Web app', now: NOW }).hint).toBe('Web app · Nov 16');
  });

  it('under a minute old says now', () => {
    expect(threadResult(thread({ updatedAt: NOW - 20_000 }), { summary: '', project: 'Web app', now: NOW }).hint).toBe('Web app · now');
  });

  it('two with one title read differently', () => {
    const a = threadResult(thread(), { summary: 'Queued for Codex.', project: 'Web app', now: NOW });
    const b = threadResult(thread({ id: 'w-2', status: 'done', updatedAt: new Date(2026, 10, 16).getTime() }), { summary: 'Done, the page is in the branch.', project: 'Web app', now: NOW });
    expect([a.sub, a.hint]).not.toEqual([b.sub, b.hint]);
  });
});

describe('⌘K draws it', () => {
  const palette = fs.readFileSync(new URL('../renderer/src/components/Palette.tsx', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');

  it('hands each thread its line, age and state', () => {
    expect(app).toMatch(/threadResult\(/);
  });

  it('draws the line under the title on the computer, with the words marked', () => {
    expect(palette).toMatch(/c\.sub/);
    expect(palette).toMatch(/markedWords\(c\.sub/);
  });
});
