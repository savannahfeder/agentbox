// A COMMENT SAYS PLAINLY WHETHER THE AGENT GOT IT (2026-11-20).
//
// Synthetic team run: a teammate's comment wore a grey "did not start the
// agent", which read as jargon and as an alarm. Theo commented "pick option 1,
// keys behind the store module, expire after 24h" on Sam's thread; Sam then
// pressed 1, nothing said Theo's details went to the agent with it, and he
// typed them again. They did go: the owner's next reply carries the comments
// since their last one. The tag now says so, before and after that reply.
// Measured on the events the thread draws.
import { describe, it, expect } from 'vitest';
import { itemThread } from '../renderer/src/item-thread';
import { messageKind } from '../renderer/src/threads/message-kind';

const line = (ts: number, patch: Record<string, unknown>, extra = {}) => ({ id: 'w-1', ts, source: 'founder', patch, ...extra });
const opening = [
  line(1, { title: 'Idempotency', body: 'Add an idempotency key.' }),
  line(2, { result: 'Where should keys be stored?\n\n## Options\n1. Store module\n2. Redis' }, { source: 'agent' }),
  line(3, { comment: { text: 'Pick option 1, expire after 24h.', name: 'Theo Park' } }, { source: 'system', by: 'p-theo', uid: 'comment-c1' }),
];
const kindOf = (ledger: ReturnType<typeof line>[]) => {
  const { events } = itemThread(ledger, [], null, { whole: true });
  return messageKind(events.find((e: { text?: string }) => (e.text ?? '').includes('24h')));
};

describe('the tag on a teammate\'s comment', () => {
  it('says it goes to the agent with the next reply, while none has come', () => {
    expect(kindOf(opening)).toEqual({ word: 'Comment', why: 'Goes to the agent with the next reply' });
  });
  it('says it went, once the owner replied after it, a picked option included', () => {
    expect(kindOf([...opening, line(4, { answer: 'Store module' })])).toEqual({ word: 'Comment', why: 'Went to the agent with the next reply' });
  });
  it('a reply from before the comment is not the one that took it', () => {
    expect(kindOf([...opening.slice(0, 2), line(3, { answer: 'Earlier' }), { ...opening[2], ts: 4 }])).toEqual({ word: 'Comment', why: 'Goes to the agent with the next reply' });
  });
  it('a reply taken back takes nothing', () => {
    expect(kindOf([...opening, line(4, { answer: '(withdrawn)' })])).toEqual({ word: 'Comment', why: 'Goes to the agent with the next reply' });
  });
  it('never says "did not start the agent"', () => {
    expect(JSON.stringify(kindOf(opening))).not.toContain('did not start');
  });
});
