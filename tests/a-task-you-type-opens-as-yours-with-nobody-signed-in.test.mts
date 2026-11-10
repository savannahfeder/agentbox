// A TASK YOU TYPE OPENS AS YOURS, WITH NOBODY SIGNED IN.
//
// Found 2026-10-11 by the first live drive of the pre-deploy check
// (.claude/skills/verify-agentbox, drive `new-thread`): on the single-person
// app, press N, type a task, ⌘↵, open it, and its history began "An agent
// opened this".
//
// Why. Sending a task writes two lines (main/store.mts composeItem): the app's
// birth stamp (source 'system', the title) and, a few milliseconds later, the
// person's own line (source 'founder', the same title, plus body and model).
// The rule that hands the stamp to the person only fired when both lines
// carried `by`, which only the signed-in team version writes
// (tests/team-a-one-line-task-opens-as-yours-not-the-agents). Measured in the
// verify copy's ledger: line 1 `system` with the title, line 2 `founder` with
// the title and model, no `by` on either, and the thread said an agent opened
// it.
import { describe, it, expect } from 'vitest';
import { threadEvents } from '../renderer/src/thread-history';

const T0 = Date.parse('2026-10-11T18:29:05-07:00');
const TITLE = 'Say hello from the verify run';
const line = (ts, source, patch, extra = {}) => ({ id: 'w-0a1b2c3d4e', ts, source, patch, ...extra });
const stamp = (extra) => line(T0, 'system', { title: TITLE, status: 'open', kind: 'directive', priority: 0, labels: ['founder'] }, extra);
const said = (lines) => threadEvents(lines).map((e) => e.said);

describe('a task typed with nobody signed in', () => {
  it('a one-line task opens as yours', () => {
    const events = threadEvents([stamp(), line(T0 + 2, 'founder', { title: TITLE, model: 'opus' })]);
    expect(events[0]).toMatchObject({ who: 'you', said: 'You opened this' });
    expect(said([stamp(), line(T0 + 2, 'founder', { title: TITLE, model: 'opus' })])).not.toContain('An agent opened this');
  });

  it('a task with a body opens as yours, with the body as its words', () => {
    const events = threadEvents([stamp(), line(T0 + 2, 'founder', { title: TITLE, body: 'Keep it short.', model: 'opus' })]);
    expect(events[0]).toMatchObject({ who: 'you' });
    expect(events.map((e) => e.said)).not.toContain('An agent opened this');
    expect(JSON.stringify(events)).toContain('Keep it short.');
  });

  it('does not then say you renamed it', () => {
    expect(said([stamp(), line(T0 + 2, 'founder', { title: TITLE, model: 'opus' })])).not.toContain('You renamed it');
  });

  it('the signed-in case still holds', () => {
    const by = 'p-test-0001';
    const events = threadEvents([stamp({ by }), line(T0 + 2, 'founder', { title: TITLE, model: 'opus' }, { by })]);
    expect(events[0]).toMatchObject({ who: 'you', said: 'You opened this', by });
  });
});

describe('a row an agent or the app started stays theirs', () => {
  it('a row an agent filed opens as the agent\'s', () => {
    expect(said([line(T0, 'agent', { title: TITLE, status: 'open', kind: 'bug' })])[0]).toBe('An agent opened this');
  });

  it('a stamp with no line of yours after it opens as the agent\'s', () => {
    expect(said([stamp(), line(T0 + 60_000, 'agent', { result: 'Done.' })])[0]).toBe('An agent opened this');
  });

  it('your edit much later, even with the same title, does not take the birth', () => {
    expect(said([stamp(), line(T0 + 10 * 60_000, 'founder', { title: TITLE })])[0]).toBe('An agent opened this');
  });

  it('two different signed-in people do not merge', () => {
    expect(said([stamp({ by: 'p-a' }), line(T0 + 2, 'founder', { title: TITLE }, { by: 'p-b' })])[0]).toBe('An agent opened this');
  });
});
