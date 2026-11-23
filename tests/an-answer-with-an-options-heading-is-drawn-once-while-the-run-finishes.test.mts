// While a cloud Codex run brought its work home, three testers saw its final
// answer twice under "Thinking in the cloud": the whole answer with an OPTIONS
// heading and its two choices, then the same paragraph and choices again
// without the heading (w-5a734dc741, 2026-11-16).
//
// Measured by feeding that thread's real ledger and trace to `itemThread` as
// they stood before the result was written. The live sentence still held the
// answer with its "## Options" line; the trace had the same answer without it,
// because `traceLines` skips any unstamped line that opens with `#`. So the
// live copy never matched the traced one and was drawn as a second message
// until the run ended.
import { describe, expect, it } from 'vitest';
import { itemThread } from '../renderer/src/item-thread.ts';

const T = Date.parse('2026-11-16T14:03:25Z');
const at = (ms: number) => new Date(T + ms).toISOString().slice(11, 19);

const ledger = [
  { id: 'w-1', ts: T - 1000, source: 'founder', patch: { answer: 'Replace docs/persistence.md with the reviewed version.' } },
  { id: 'w-1', ts: T + 6000, source: 'agent', epoch: 4, claim: { holder: 'mcp-cloud-1', leaseUntil: T + 300_000 }, patch: { status: 'claimed' } },
];

const ANSWER = [
  '**The original now contains the reviewed content; the extra version is deleted.**',
  '',
  'Updated docs/persistence.md in place. Committed as `446a07c`; whitespace checks passed. Nothing shipped.',
  '',
  '## Options',
  '1. It updated correctly; keep shipping paused (recommended)',
  '2. Investigate why the open document hasn’t updated',
].join('\n');

// The trace as the supervisor writes it: the first line stamped, the rest raw.
const traced = (text: string) => {
  const [first, ...rest] = text.split('\n');
  return [`${at(45_000)}  ${first}`, ...rest].join('\n');
};
const trace = (text: string) => ({
  startedAt: T,
  text: [
    '# Appointment storage',
    `${at(19_000)}  I’ll put the reviewed content into docs/persistence.md.`,
    `${at(27_000)}  [Edit] docs/persistence.md`,
    traced(text),
  ].join('\n'),
});
const live = (text: string) => ({ text, at: T + 41_000, run: T });
const messages = (t: ReturnType<typeof itemThread>) => t.events.filter((e) => e.kind !== 'work').map((e) => e.text);
const copiesOf = (t: ReturnType<typeof itemThread>, words: string) =>
  [...messages(t), ...(t.outcome ? [t.outcome.text] : [])].filter((m) => (m ?? '').includes(words)).length;

describe('the answer the run is finishing with', () => {
  it('is drawn once before the result is written, when it carries an options heading', () => {
    const t = itemThread(ledger, [trace(ANSWER)], live(ANSWER));
    expect(copiesOf(t, 'Updated docs/persistence.md in place')).toBe(1);
  });

  it('is drawn once when a blank line follows the heading', () => {
    const answer = ANSWER.replace('## Options\n', '## Options\n\n');
    const t = itemThread(ledger, [trace(answer)], live(answer));
    expect(copiesOf(t, 'Updated docs/persistence.md in place')).toBe(1);
  });

  it('is drawn once after the result is written, as it was', () => {
    const done = [...ledger, { id: 'w-1', ts: T + 48_000, source: 'agent', patch: { result: ANSWER } }];
    const t = itemThread(done, [trace(ANSWER)], live(ANSWER));
    expect(copiesOf(t, 'Updated docs/persistence.md in place')).toBe(1);
    expect(t.outcome?.text).toBe(ANSWER);
  });

  it('keeps a live message whose words differ from the traced one', () => {
    const next = 'Now checking the open document.\n\n## Why\nIt still shows the old version.';
    const t = itemThread(ledger, [trace(ANSWER)], { ...live(next), at: T + 50_000 });
    expect(copiesOf(t, 'Updated docs/persistence.md in place')).toBe(1);
    expect(messages(t).at(-1)).toBe(next);
  });
});
