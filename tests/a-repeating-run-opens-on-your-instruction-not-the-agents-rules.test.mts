// The power test of 2026-10-25 opened a repeating task's run and found its
// first message, from "The agent", to be the rules the app gives the agent in
// capitals: "THIS IS ONE RUN OF A REPEATING TASK. It runs again tomorrow
// whatever happens here...", labels to set, "HER INSTRUCTION FOLLOWS." and
// only then the person's own words. It talked about her as "her" and said
// "tomorrow" for a Friday rule. The run's body carries those rules for the
// agent; the thread and the inbox line now show only the instruction, as yours.
import { describe, it, expect } from 'vitest';
import { OCCURRENCE_PROTOCOL } from '../main/repeats.mjs';
import { instructionOf } from '../shared/repeats.mjs';

const { threadEvents } = await import('../renderer/src/thread-history.ts');
const { rowSummary } = await import('../renderer/src/list-rules.ts');

const ASK = 'Write a five bullet summary of what shipped in Product this week.';
const body = `${OCCURRENCE_PROTOCOL.replace('<REPEAT_LABEL>', 'repeat:r-f1fc35ad54')}\n\n${ASK}`;
const T0 = Date.parse('2026-10-25T21:57:00Z');
const birth = [{ id: 'w-1', ts: T0, source: 'system', patch: { title: 'Weekly update · Fri, Oct 23', body, status: 'open', kind: 'directive', labels: ['founder', 'repeat:r-f1fc35ad54'] } }];

describe('a run of a repeating task', () => {
  it('opens on your instruction, as yours, with none of the agent\'s rules', () => {
    const [first] = threadEvents(birth);
    expect(first).toMatchObject({ who: 'you', words: ASK, message: true });
    expect(JSON.stringify(threadEvents(birth))).not.toMatch(/THIS IS ONE RUN|INSTRUCTION FOLLOWS/);
  });

  it('shows your instruction as its line in the inbox before it has an answer', () => {
    const line = rowSummary({ title: 'Weekly update · Fri, Oct 23', body, status: 'open', labels: ['founder', 'repeat:r-f1fc35ad54'] }, 'inbox');
    expect(line).not.toMatch(/THIS IS ONE RUN/);
    expect(line).toMatch(/^Write a five bullet summary/);
  });
});

describe('the instruction in a body', () => {
  it('is what follows the rules, and the whole body when there are none', () => {
    expect(instructionOf(body)).toBe(ASK);
    expect(instructionOf('Fix the login button')).toBe('Fix the login button');
    // Words that merely mention the marker are not a run's rules.
    expect(instructionOf('Explain what HER INSTRUCTION FOLLOWS. means in our brief')).toBe('Explain what HER INSTRUCTION FOLLOWS. means in our brief');
  });
});
