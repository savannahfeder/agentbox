// TWO ASKS THAT CROSS IN A CHAT EACH REACH NEEDS YOU (2026-11-20).
//
// Two copies on the stand-in cloud: Theo sent Sam "Help with this step: ..."
// in their chat at 02:04:32, and eleven seconds later Sam sent Theo his own
// "Help with this step: ..." in the same chat. Sam's Needs you never showed
// Theo's ask: a message of mine in a chat settles everything before it, and
// Sam's ask was read as his answer. Read off the stand-in's room messages.
// An ask of mine is not an answer to theirs; anything else I write still is.
import { describe, it, expect } from 'vitest';
import { groupRow } from '../shared/room-needs-you.mts';
import { askWords, isAsk } from '../shared/thread-ask.mts';

const link = (owner: string) => `https://app.agentbox.ac/t/${owner}/w-0000000abc`;
const theirs = { id: 'm-1', by: 'p-theo', at: 1000, body: askWords({ want: 'help', title: 'Unvalidated payments API routes', link: link('p-theo'), note: 'Can you pick hand-written checks or a schema library?' }) };
const row = (mine: { id: string; by: string; at: number; body: string }) => groupRow({ roomId: 'r-1', roomName: 'Sam', messages: [theirs, mine], me: 'p-sam', pair: true });

describe('an ask in a chat', () => {
  it('is still to me after I send my own ask in the same chat', () => {
    const mine = { id: 'm-2', by: 'p-sam', at: 1011, body: askWords({ want: 'help', title: 'Idempotency key', link: link('p-sam'), note: 'Could you look at this step?' }) };
    expect(row(mine)?.messageId).toBe('m-1');
  });
  it('is answered by anything else I write after it', () => {
    expect(row({ id: 'm-2', by: 'p-sam', at: 1011, body: 'Schema library, zod.' })).toBeNull();
  });
  it('is told from a message that only starts with the same words', () => {
    expect(isAsk(theirs.body)).toBe(true);
    expect(isAsk('Help with this step: no link here')).toBe(false);
    expect(isAsk(askWords({ want: 'review', title: 'Empty state', link: link('p-sam'), note: '' }))).toBe(true);
  });
});
