// A helper's hand-back note landed while the owner's agent was running, and is held for the owner. The owner's next
// reply went alone, so the agent answered "I saw nothing from Sam about callers" under the note saying it.
import { describe, it, expect } from 'vitest';
import { queuedReplyText, type QueuedLine } from '../main/live-replies.mts';
import { handedBackWords } from '../shared/thread-asks.mts';

const back = (words: string, kind: 'help' | 'review' = 'help') => handedBackWords({ kind, name: 'Sam', verdict: kind === 'review' ? 'changes' : null, words, asked: null });
const you = (ts: number, answer: string): QueuedLine => ({ ts, source: 'founder', patch: { answer } });
const sam = (ts: number, answer: string): QueuedLine => ({ ts, source: 'system', patch: { answer, from: { name: 'Sam Ortiz' } } });
const agent = (ts: number): QueuedLine => ({ ts, source: 'agent', patch: { result: 'Done so far.' } });

const textFor = (lines: QueuedLine[], answeredThrough = 0) => {
  const last = lines.filter((l) => l.patch?.answer).at(-1)!;
  const from = last.patch!.from?.name;
  return String(queuedReplyText({ answer: last.patch!.answer, answeredThrough, wrote: { answer: { ts: last.ts, source: last.source, ...(from ? { from } : {}) } } } as never, lines, () => false));
};

describe('a hand-back that came during a run', () => {
  it.each(['help', 'review'] as const)('goes to the agent with your next reply, as theirs (%s)', (kind) => {
    const text = textFor([you(1, 'Build it.'), sam(2, back('One worry: callers break.', kind)), agent(3), you(4, 'Sam is right about callers.')]);
    expect(text).toContain('Sam Ortiz, a teammate');
    expect(text).toContain('One worry: callers break.');
    expect(text.indexOf('callers break')).toBeLessThan(text.indexOf('Sam is right about callers.'));
  });

  it('goes even when the run counted everything to its end as answered', () => {
    expect(textFor([you(1, 'Build it.'), sam(2, back('One worry.')), agent(3), you(4, 'Go on.')], 3)).toContain('One worry.');
  });

  it('goes once: a reply after that does not bring it again', () => {
    const text = textFor([you(1, 'Build it.'), sam(2, back('One worry.')), agent(3), you(4, 'Go on.'), agent(5), you(6, 'And the tests.')]);
    expect(text).toBe('And the tests.');
  });

  it('leaves out what a helper said to the agent itself, which it had in that run', () => {
    const text = textFor([you(1, 'Build it.'), sam(2, 'Use the second option.'), agent(3), you(4, 'Go on.')]);
    expect(text).toBe('Go on.');
  });

  it('still goes when it came after the agent\'s answer, as before', () => {
    expect(textFor([you(1, 'Build it.'), agent(2), sam(3, back('One worry.')), you(4, 'Go on.')])).toContain('One worry.');
  });

  it('a reply you took back ends what is carried', () => {
    expect(textFor([you(1, 'Build it.'), sam(2, back('Old.')), you(3, '(withdrawn)'), agent(4), you(5, 'Go on.')])).toBe('Go on.');
  });
});
