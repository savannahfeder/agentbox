// A THREAD IN LATER WHOSE AGENT THEN ASKS YOU SOMETHING COMES BACK (w-34443a206b).
//
// Two testers on 2026-11-22 pressed L on a thread while its agent worked. The
// agent then stopped on a question, and the thread stayed in Later until the
// time they had picked, with nothing moving. Only their own words lifted a
// Later, so a question that arrived after it never reached Needs you.
// Measured on hiddenUntil and belongsInInbox, which the window and the phone
// both read.
import { describe, expect, it } from 'vitest';
import { belongsInInbox, hiddenUntil } from '../renderer/src/list-rules.ts';

const NOW = 1_790_000_000_000;
const TOMORROW = NOW + 24 * 3_600_000;
const putOff = { ts: NOW - 60_000, source: 'founder' };

const thread = (result: string, resultAt: number, over: Record<string, unknown> = {}) => ({
  id: 'w-thread', status: 'open', kind: 'task', labels: ['founder'],
  createdAt: NOW - 3_600_000, updatedAt: resultAt,
  snoozedUntil: TOMORROW, result,
  wrote: { title: { ts: NOW - 3_600_000, source: 'founder' }, snoozedUntil: putOff, result: { ts: resultAt, source: 'agent' } },
  ...over,
});
const placed = (i: ReturnType<typeof thread>) => ({ hidden: hiddenUntil(i) > NOW, inbox: belongsInInbox(i, { hiddenUntil: hiddenUntil(i), now: NOW }) });

const QUESTION = 'The page builds. Which of the two headlines should it use?';
const PICK = '**Ship it?**\n\n## Options\n1. Ship it (recommended)\n2. Change the headline first';

describe('an agent that stops on a question after you put the thread off', () => {
  it('brings it back to Needs you', () => {
    expect(placed(thread(QUESTION, NOW - 1000))).toEqual({ hidden: false, inbox: true });
  });

  it('whether it asks in words or offers a pick', () => {
    expect(placed(thread(PICK, NOW - 1000))).toEqual({ hidden: false, inbox: true });
  });
});

describe('what stays in Later', () => {
  it('a question that was there when you put it off', () => {
    expect(placed(thread(QUESTION, NOW - 120_000)).hidden).toBe(true);
  });

  it('an answer that asks nothing', () => {
    expect(placed(thread('Done, the page is built and the tests are green.', NOW - 1000)).hidden).toBe(true);
  });

  it('an answer whose only choice is to close it', () => {
    expect(placed(thread('Done.\n\n## Options\n1. Close this task', NOW - 1000)).hidden).toBe(true);
  });

  it('a question you put off with words of your own, which you then answered', () => {
    const answered = thread(QUESTION, NOW - 120_000, { answer: 'The first one.' });
    answered.wrote = { ...answered.wrote, answer: { ts: NOW - 90_000, source: 'founder' } } as typeof answered.wrote;
    expect(placed(answered).hidden).toBe(true);
  });

  it('a newer checkpoint that carries on after the question', () => {
    const carried = thread(QUESTION, NOW - 1000, { note: 'Picked the first headline myself, carrying on.' });
    carried.wrote = { ...carried.wrote, note: { ts: NOW - 500, source: 'agent' } } as typeof carried.wrote;
    expect(placed(carried).hidden).toBe(true);
  });
});
