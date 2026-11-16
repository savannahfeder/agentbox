// A cloud run that hands its thread to the Mac ends on the line
// "AGENTBOX-NEEDS-THE-COMPUTER: …", which is for the app to read. When that line
// was the run's answer, the thread drew it word for word as the agent's message
// (two overnight testers, 2026-11-16: under "Moved to this Mac", and as the only
// answer to Ship it). The trace already drew the move; the answer did not.
import { describe, it, expect } from 'vitest';
import { itemThread } from '../renderer/src/item-thread';
import { HAND_BACK, withoutHandBack } from '../shared/cloud-hand-back.mts';

const line = (ts: number, patch: Record<string, unknown>, extra = {}) => ({ id: 'w-1', ts, source: 'founder', patch, ...extra });
const texts = (ledger: ReturnType<typeof line>[]) => {
  const { events, outcome } = itemThread(ledger as never, [], null, { whole: true });
  return [...events.map((e) => ('text' in e ? e.text : 'kind' in e && e.kind === 'work' ? `${e.verb} ${e.subject}` : '') ?? ''), outcome?.text ?? ''];
};

describe('the hand-back line in an answer', () => {
  it('is not drawn when it is the whole answer, and the move is', () => {
    const shown = texts([
      line(1, { title: 'Team note', body: 'Write the note.' }),
      line(2, { result: `${HAND_BACK} running this reply on your Mac` }, { source: 'agent' }),
    ]);
    expect(shown.join('\n')).not.toContain(HAND_BACK);
    expect(shown).toContain('moved to this Mac');
  });

  it('is taken out of a longer answer, and the rest stays', () => {
    const shown = texts([
      line(1, { title: 'Ship it', body: 'Merge it.' }),
      line(2, { result: `The tests pass.\n\n${HAND_BACK} merging into main` }, { source: 'agent' }),
    ]);
    expect(shown.join('\n')).not.toContain(HAND_BACK);
    expect(shown.join('\n')).toContain('The tests pass.');
  });

  it('leaves an answer that only mentions the words mid-line alone', () => {
    expect(withoutHandBack(`Do not write ${HAND_BACK} here.`)).toBe(`Do not write ${HAND_BACK} here.`);
  });

  it('leaves a person\'s own message alone', () => {
    const shown = texts([
      line(1, { title: 'Q', body: 'Ask.' }),
      line(2, { answer: `${HAND_BACK} what is this?` }),
    ]);
    expect(shown.join('\n')).toContain(`${HAND_BACK} what is this?`);
  });
});
