// EVERY THREAD IS NAMED IN THE SAME STYLE, INCLUDING ONE WHOSE OPENING LINE WAS SHORT.
//
// What broke, reported 2026-10-23 from a room board: seven of a power tester's
// twelve threads read "add rate limiting to POST /payments", "add cors headers to the
// api" and so on, lowercase, between five in sentence case ("Web app bundle
// size investigation"). The five were named by the app; the seven never were,
// because `isWrittenName` treated any typed first line of 64 characters or
// fewer, 8 words or fewer and no closing punctuation as a name its person chose
// and kept it verbatim. Measured by running that check on all seven titles:
// each one counted as already named.
//
// The rule was added beside "name a thread once, never again" (2026-10-01),
// which is what actually stopped names moving under people. Naming once is
// enough; a list in one style is worth more than keeping a short line verbatim,
// and the namer is told to keep a short line's words and fix only its case.

import { describe, it, expect } from 'vitest';
import { rowTitle } from '../renderer/src/list-rules';
import { namePrompt, wantsName } from '../main/row-label.mjs';

const SHORT_TYPED = [
  'add rate limiting to POST /payments',
  'add cors headers to the api',
  'add pagination to GET /appointments, limit and offset',
  'add idempotency key to POST /payments, use codex',
  'add a /health endpoint',
  'add a loading spinner to the booking button',
  'add dark mode to the web app',
];

const typed = (title, over = {}) => ({
  status: 'open',
  title,
  body: '',
  wrote: { title: { ts: 10, source: 'founder' } },
  ...over,
});

describe('a short typed opening line is named like every other thread', () => {
  it.each(SHORT_TYPED)('names "%s"', (title) => {
    expect(wantsName(typed(title))).toBe(true);
  });

  it('names one already in sentence case too, so the style comes from one place', () => {
    expect(wantsName(typed('Add comment to cart.js'))).toBe(true);
    expect(wantsName(typed('Ship'))).toBe(true);
  });

  it('names one an agent filed, which never had a person typing it', () => {
    expect(wantsName(typed('fix flaky booking test', { wrote: { title: { ts: 10, source: 'agent' } } }))).toBe(true);
  });
});

describe('it is still named once', () => {
  const named = typed('add a /health endpoint', {
    label: 'Add a /health endpoint',
    wrote: { title: { ts: 10, source: 'founder' }, label: { ts: 20, source: 'agent' } },
  });

  it('draws the name, not the typed line', () => {
    expect(rowTitle(named)).toBe('Add a /health endpoint');
  });

  it('never names it again, whatever an agent writes on it', () => {
    expect(wantsName(named)).toBe(false);
    expect(wantsName({
      ...named,
      note: 'Added GET /health returning 200.',
      result: 'Done, tests green.',
      wrote: { ...named.wrote, note: { ts: 60_000, source: 'agent' }, result: { ts: 120_000, source: 'agent' } },
    })).toBe(false);
  });

  it('leaves a person who renames it afterwards with their name on the row', () => {
    const renamed = { ...named, title: 'health check', wrote: { ...named.wrote, title: { ts: 900_000, source: 'founder' } } };
    expect(rowTitle(renamed)).toBe('health check');
    expect(wantsName(renamed)).toBe(false);
  });
});

describe('what is still never named', () => {
  it('a done row', () => {
    expect(wantsName(typed('add a /health endpoint', { status: 'done' }))).toBe(false);
  });

  it('a row with no words on it', () => {
    expect(wantsName(typed('   '))).toBe(false);
    expect(wantsName(typed(''))).toBe(false);
  });
});

describe('the namer keeps a short line close to what was typed', () => {
  it('tells the model to keep its words and fix only the case', () => {
    const prompt = namePrompt(typed('add a /health endpoint'));
    expect(prompt).toMatch(/already a short name, keep its words/i);
    expect(prompt).toContain('sentence case');
  });
});
