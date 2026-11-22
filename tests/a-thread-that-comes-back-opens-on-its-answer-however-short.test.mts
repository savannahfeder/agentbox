// A THREAD THAT COMES BACK OPENS ON ITS ANSWER, HOWEVER SHORT (w-e4f12e9207, 2026-11-13).
//
// The founder opened a finished thread from Needs you and got a chat: "Read
// files, searched files", the agent's "Found it: ..." progress line, a model
// byline, and the answer with its bold line drawn as an ordinary paragraph.
// Other threads opened on the focused page: the name, its Context, "Show N
// earlier messages" and the answer under its headline. The difference was the
// count behind the fold. With one or two messages (the ask, one progress line)
// `drawnWhole` drew the whole conversation instead
// (a-short-thread-is-drawn-whole-with-your-ask-in-it). Now a page that leads
// with a fresh answer always folds; only the view from an answer you have
// since followed up still draws one or two messages above it in place.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { drawnWhole, earlierCount, newestAnswer, standsAt } from '../renderer/src/one-thing-at-a-time.ts';
import { pageOf } from '../mobile/src/lib/one-page.ts';

const you = (at: number, text: string) => ({ at, who: 'you' as const, text });
const it_ = (at: number, text: string) => ({ at, who: 'it' as const, text });
const work = (at: number) => ({ kind: 'work' as const, at, verb: 'Searched', subject: 'files', output: '', lines: 0, failed: false });
const result = (at: number, text: string) => ({ at, text, field: 'result' as const });

const ANSWER = '**No real cause for concern: the bounce went to the demo login.**\n\nIt has no inbox.';

describe('a thread that has just come back', () => {
  it('folds the ask and one progress line behind the answer (the reported thread)', () => {
    const events = [you(1, 'why did this email bounce?'), work(2), it_(3, 'Found it: the bounce is the demo account.'), work(4)];
    const behind = earlierCount(events, result(9, ANSWER));
    expect(behind).toBe(2);
    expect(drawnWhole(behind, { leads: true })).toBe(false);
  });

  it('folds a lone ask behind the answer', () => {
    expect(drawnWhole(1, { leads: true })).toBe(false);
  });

  it('folds a long one, as before', () => {
    expect(drawnWhole(3, { leads: true })).toBe(false);
    expect(drawnWhole(8, { leads: true })).toBe(false);
  });
});

describe('the view from an answer you have since followed up keeps its short history in place', () => {
  it('draws the ask above the answer you replied to', () => {
    const events = [you(1, 'add pagination'), it_(5, 'Done, cursor based.'), you(9, 'also do the tests')];
    expect(standsAt(events, newestAnswer(events, null))).toBe(1);
    expect(drawnWhole(1)).toBe(true);
    expect(drawnWhole(2, { leads: false })).toBe(true);
  });

  it('folds three or more there too', () => {
    expect(drawnWhole(3)).toBe(false);
  });

  it('but a chat brought in from Claude Code or Codex always folds', () => {
    expect(drawnWhole(1, { imported: true })).toBe(false);
  });
});

describe('the phone app draws the same page', () => {
  const item = { product: 'p', id: 'w-1', title: 'Email bounce', problem: 'You asked why an email bounced.' } as Parameters<typeof pageOf>[0];

  it('leads with the answer under its headline for a two-message thread', () => {
    const events = [you(1, 'why did this email bounce?'), it_(3, 'Found it.')];
    const page = pageOf(item, events, result(9, ANSWER), [], false);
    expect(page.answer?.headline).toBe('No real cause for concern: the bounce went to the demo login.');
    expect(page.toggle).toBe('Show 2 earlier messages');
  });

  it('and for a one-message thread', () => {
    const page = pageOf(item, [you(1, 'why did this email bounce?')], result(9, ANSWER), [], false);
    expect(page.answer).not.toBeNull();
    expect(page.toggle).toBe('Show 1 earlier message');
  });
});

describe('where the pages ask it', () => {
  it('the desktop thread page says whether it leads with an answer', () => {
    const page = fs.readFileSync(new URL('../renderer/src/components/ItemThread.tsx', import.meta.url), 'utf8');
    expect(page).toContain('const short = !earlierOpen && drawnWhole(behind, { leads: alone, imported: broughtIn(item) });');
  });
});
