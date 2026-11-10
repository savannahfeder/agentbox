// A NUMBER STAYS PUT WHEN MORE IS COMING, AND THE TOAST SAYS WHAT WENT WHERE.
//
// Dev pressed 2 on "Staff password authentication", then R,
// and his instruction landed in "Integration branch quality lead fixes" because the
// screen had already moved on without telling him; the wrong agent answered "this
// looks meant for the sign-in thread". "Option 2 sent → Lumen" named neither.
//
// Moving on after a send is the owner's own rule and stays
// (tests/a-reply-keeps-you-on-the-thread-unless-you-are-clearing-your-inbox). What
// changes: a pick that will plainly be followed by more stays, and R on a thread
// the app has just moved you to says whose box it opened.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { pickStaysPut, pickSentWords, sayWhoseBox, replyMovesOn } from '../renderer/src/advance.ts';

describe('a pick stays on the thread', () => {
  it.each([
    'Which branch should it go on?',
    'Ask me about the rate limit first',
    'I will explain what to change',
    "I'll say which ones",
    'Let me explain',
  ])('when the option promises more: %s', (o) => expect(pickStaysPut(o, { live: false })).toBe(true));

  it('when an agent is working on the thread right now, and answers in the same breath', () => {
    expect(pickStaysPut('Add sign-out and a rate limit', { live: true })).toBe(true);
  });
});

describe('a pick moves on, as the owner asked', () => {
  it.each([
    'Add sign-out and a rate limit',
    'Ship it (recommended)',
    'Tell the team tomorrow',
    'Ask Maya for the repo',
  ])('%s', (o) => expect(pickStaysPut(o, { live: false })).toBe(false));

  it('and clearing Needs you still moves on after a send', () => {
    expect(replyMovesOn({ view: 'inbox', onBoard: false, index: 0 })).toBe(true);
  });
});

describe('the toast', () => {
  it('names the words and the thread', () => {
    expect(pickSentWords('Add sign-out and a rate limit (recommended)', 'Staff password authentication'))
      .toBe('Sent “Add sign-out and a rate limit” to Staff password authentication');
  });
  it('cuts long words rather than the sentence that names the thread', () => {
    const words = pickSentWords('x'.repeat(200), 'Staff password');
    expect(words.length).toBeLessThan(90);
    expect(words.endsWith(' to Staff password')).toBe(true);
  });
});

describe('R just after the app moved you', () => {
  const arrival = { key: 'lumen/w-2', at: 1000 };
  it('says whose box it opened', () => {
    expect(sayWhoseBox(arrival, 'lumen/w-2', 1000 + 4000)).toBe(true);
  });
  it('says nothing once you have had time to read, on a thread you opened yourself, or with no move at all', () => {
    expect(sayWhoseBox(arrival, 'lumen/w-2', 1000 + 30_000)).toBe(false);
    expect(sayWhoseBox(arrival, 'lumen/w-9', 1000)).toBe(false);
    expect(sayWhoseBox(null, 'lumen/w-2', 1000)).toBe(false);
  });
});

it('the app uses all three', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  expect(app).toMatch(/pickSentWords\(option\.text, rowTitle\(item\)\), takeBack, !movesOn\(item\) \|\| pickStaysPut\(option\.text, \{ live: liveIds\.has\(item\.id\) \}\)/);
  expect(app).toMatch(/sayWhoseBox\(arrived\.current, keyOf\(focused\), Date\.now\(\)\)/);
});
