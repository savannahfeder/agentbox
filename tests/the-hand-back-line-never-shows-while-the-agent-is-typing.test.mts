// The hand-back line was taken out of a cloud run's saved answer on 2026-11-16,
// but not out of the words drawn while the agent is still typing them. Round
// three of that night's cloud test saw "AGENTBOX-NEEDS-THE-COMPUTER: merging
// into main" verbatim in the chat right after picking Ship it on a cloud thread.
import { describe, it, expect } from 'vitest';
import { itemThread } from '../renderer/src/item-thread';
import { HAND_BACK } from '../shared/cloud-hand-back.mts';

const opening = [{ id: 'w-1', ts: 1, source: 'founder', patch: { title: 'Ship it', body: 'Merge it.' } }];
const shown = (text: string) => {
  const { events } = itemThread(opening as never, [], { text, at: 5, run: 2 }, { whole: true });
  return events.map((e) => ('text' in e ? e.text ?? '' : '')).join('\n');
};

describe('the words an agent is typing', () => {
  it('never show the hand-back line when it is all they are', () => {
    expect(shown(`${HAND_BACK} merging into main`)).not.toContain(HAND_BACK);
  });

  it('keep what comes before the line', () => {
    const words = shown(`The tests pass.\n${HAND_BACK} merging into main`);
    expect(words).not.toContain(HAND_BACK);
    expect(words).toContain('The tests pass.');
  });

  it('are drawn as typed when there is no such line', () => {
    expect(shown('Reading the routes now.')).toContain('Reading the routes now.');
  });
});
