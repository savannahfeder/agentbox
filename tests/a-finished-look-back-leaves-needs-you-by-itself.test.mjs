// A FINISHED LOOK-BACK LEAVES NEEDS YOU BY ITSELF.
//
// What broke (w-cad26266fb, 2026-11-10): in a one-hour power test, both
// testers watched "Learn from your recent replies" end and land at the top of
// Needs you as Waiting on you, one with Ship it / Change something first /
// Throw it away under it. The run is the teammate's own housekeeping and asks
// nothing of you; it was only told to close itself, and a run that did not was
// left in the one list a person reads.
//
// Now the app closes a finished look-back quietly, whatever its answer says, and
// says nothing in the chat for it: the run posts its own line when the method
// changed. A look-back that is blocked stays, so a stuck one is still seen.
import { describe, it, expect } from 'vitest';
import { planWakes, teammateLabel, DEFAULT_LIMIT, LOOK_BACK_LABEL } from '../shared/teammates.mts';

const NOW = new Date(2026, 10, 10, 9, 0).getTime();
const t = { id: 't-aaaaaa', name: 'Quality lead', letter: 'Q', status: 'active', paused: false, served: '', limit: DEFAULT_LIMIT, works: null, product: 'kestrel', memory: [], duties: [], dutyServed: {} };
const chat = { messages: [], seen: new Set() };

const run = (labels, { status = 'open', result = 'I went back over 3 threads and tightened my method.' } = {}) => ({
  id: 'w-lookback1', product: 'kestrel', title: 'Learn from your recent replies', status, result,
  labels: ['founder', teammateLabel(t.id), 'hop:0', ...labels],
  createdAt: NOW - 60_000,
  wrote: { result: { source: 'agent', ts: NOW - 1000 } },
});
const closes = (item) => planWakes({ teammates: [t], chat, items: [item], now: NOW }).filter((a) => a.type === 'replied' && a.item === item.id);

describe('a look-back that has finished', () => {
  it('is closed by the app and says nothing more in the chat', () => {
    const [a] = closes(run([LOOK_BACK_LABEL]));
    expect(a).toMatchObject({ teammate: t.id, product: 'kestrel', say: false });
  });

  it('is closed even when its answer offers choices', () => {
    expect(closes(run([LOOK_BACK_LABEL], { result: 'Done.\n\n## Options\n1. Ship it\n2. Throw it away' }))).toHaveLength(1);
  });

  it('stays in Needs you when it is blocked', () => {
    expect(closes(run([LOOK_BACK_LABEL], { status: 'blocked' }))).toHaveLength(0);
  });

  it('leaves an ordinary run that ended with a question to you', () => {
    expect(closes(run([], { result: 'Which one?\n\n## Options\n1. This\n2. That' }))).toHaveLength(0);
  });
});
