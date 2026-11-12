// A NOTE SENT TO A TEAMMATE DOES NOT SAY IT GOES WITH YOUR NEXT REPLY (2026-11-12).
//
// A tester wrote a note on his agent's audit naming his teammate, pressed
// Send to Lena, and the thread then showed the note tagged "Goes with your
// next reply", so he could not tell whether she or his agent would get it.
// The tag is for a note held for the agent. A note that names a person is
// never handed to the agent (main/notes-wake.mts reads noteGoesTo), so it
// wears no such tag. Measured by reading the events the thread draws.
import { describe, expect, it } from 'vitest';
import { itemThread } from '../renderer/src/item-thread';
import { messageKind } from '../renderer/src/threads/message-kind';

const line = (ts, patch, extra = {}) => ({ id: 'w-1', ts, source: 'founder', patch, ...extra });
const note = (id, text, more = {}) => ({ artifact: { do: 'note', id, file: 'auth-audit.md', text, place: { kind: 'whole' }, wait: true, ...more } });
const kindOf = (ledger, words) => {
  const { events } = itemThread(ledger, [], null, { whole: true });
  return messageKind(events.find((e) => (e.text ?? '').includes(words)));
};
const start = [line(1, { title: 'Audit', body: 'Audit the auth.' }), line(2, { result: 'Wrote auth-audit.md' }, { source: 'agent' })];

describe('a note on a file, in the thread', () => {
  it('held for your agent says it goes with your next reply', () => {
    expect(kindOf([...start, line(3, note('n1', 'Tighten the header'), { by: 'u-theo' })], 'Tighten')).toMatchObject({ why: 'Goes with your next reply' });
  });
  it('sent to a teammate says only what it is a note on', () => {
    const kind = kindOf([...start, line(3, note('n2', 'Lena, does the web app send a token?', { mentions: ['u-lena'] }), { by: 'u-theo' })], 'send a token');
    expect(kind).toMatchObject({ word: 'Note on auth-audit.md', file: true });
    expect(kind.why).toBeUndefined();
  });
  it('signed with your own name is still held for your agent', () => {
    expect(kindOf([...start, line(3, note('n3', 'Theo: tighten the header', { mentions: ['u-theo'] }), { by: 'u-theo' })], 'tighten')).toMatchObject({ why: 'Goes with your next reply' });
  });
  it('already sent to the agent wears no tag', () => {
    const ledger = [...start, line(3, note('n4', 'Tighten the header'), { by: 'u-theo' }), line(4, { artifact: { do: 'sent', on: ['n4'] } }, { by: 'u-theo' })];
    expect(kindOf(ledger, 'Tighten')?.why).toBeUndefined();
  });
});
