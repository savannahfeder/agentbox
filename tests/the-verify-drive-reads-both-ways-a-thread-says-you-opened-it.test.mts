// A CLEAN BRANCH READ "NOT READY" BECAUSE THE DRIVE KNEW ONE WORDING.
//
// Found 2026-10-14 (w-e709252ec0) verifying the ACP branch. The pre-deploy
// check ran 21 drives; 20 held and `real: new-thread` failed on
//   FAIL  the thread says you opened it, not an agent  (neither line on screen)
// with a screenshot of a thread that drew "You" beside "Today 1:59pm" over the
// ask. The same claim had passed in the `live` layer minutes earlier on the
// same build, which is what gave it away: the screen was right both times and
// the drive could only read one of the two forms.
//
// WHY A THREAD HAS TWO FORMS. An opening with no words of its own draws as the
// quiet sentence ("You opened this"); an opening that carries words draws as a
// message, your byline over them, and the sentence is not on the screen at all
// (renderer/src/item-thread.ts, `event.message && event.words`). A row whose
// worker gave it a short name gets words either way, because the title is said
// in the opening once the header is showing that name (thread-history.ts,
// `withTitleSaid`). Real Claude Code names the rows it works; the stand-in does
// not, and that is the whole difference between the two layers.
import { describe, it, expect } from 'vitest';
import { itemThread } from '../renderer/src/item-thread';
import { whoOpenedThread } from '../.claude/skills/verify-agentbox/scripts/drives.mjs';

const T0 = Date.parse('2026-10-14T13:59:00-07:00');
const TITLE = 'Verify vf8kq2: reply with exactly the word PINEAPPLE and nothing else.';
const line = (ts, source, patch) => ({ id: 'w-0a1b2c3d4e', ts, source, patch });
// What composing from the keyboard writes: the app's stamp, then your own line.
const composed = [
  line(T0, 'system', { title: TITLE, status: 'open', kind: 'directive', priority: 0, labels: ['founder'] }),
  line(T0 + 2, 'founder', { title: TITLE, model: 'opus' }),
];
const verbs = (lines) => itemThread(lines, []).events.filter((e) => e.kind === 'work').map((e) => e.verb);
const first = (lines) => itemThread(lines, []).events[0];

describe('what a thread you opened puts on the screen', () => {
  // SINCE w-326fb83c0e A ONE-LINE THREAD SAYS WHAT YOU TYPED, named or not: it
  // is a title with no body, and the quiet sentence left the ask in the header
  // and nowhere else. So this form is your byline over the ask as well, which
  // is why the drive has to read both.
  it('with no short name, your byline over the ask and no sentence', () => {
    expect(first(composed)).toMatchObject({ who: 'you' });
    expect(verbs(composed).join(' ')).not.toMatch(/opened this/);
  });

  it('once its worker names it, your byline over the ask, and still no sentence', () => {
    const named = [...composed, line(T0 + 30_000, 'agent', { label: 'Say PINEAPPLE' })];
    expect(first(named)).toMatchObject({ who: 'you' });
    expect(verbs(named).join(' ')).not.toMatch(/opened this/);
  });

  it('a thread an agent filed still says so', () => {
    expect(verbs([line(T0, 'agent', { title: TITLE, status: 'open', kind: 'bug' })])).toContain('An agent opened this');
  });
});

describe('the drive reading who opened the thread', () => {
  const read = (seen) => whoOpenedThread(seen).who;

  it('takes the sentence', () => {
    expect(read({ youSaid: true })).toBe('you');
  });

  it('takes your byline over the opening, which is what a named row draws', () => {
    expect(read({ opener: 'You' })).toBe('you');
  });

  it('fails on an agent, by its sentence or by its byline', () => {
    expect(read({ agentSaid: true })).toBe('agent');
    expect(read({ agentSaid: true, opener: 'You' })).toBe('agent');
    expect(read({ opener: 'The agent' })).toBe('agent');
  });

  it('fails on an empty thread rather than passing it', () => {
    expect(read({})).toBe(null);
    expect(read({ opener: '' })).toBe(null);
  });

  it('says what it saw, so a failure names the screen', () => {
    expect(whoOpenedThread({ opener: 'You' }).saw).toMatch(/byline/);
    expect(whoOpenedThread({}).saw).toBeTruthy();
    expect(whoOpenedThread({ opener: 'Ada' })).toMatchObject({ who: null, saw: expect.stringContaining('Ada') });
  });
});
