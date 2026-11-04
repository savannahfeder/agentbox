// 2026-10-31: Sofia posted onboarding B in the team chat for Maya;
// Maya pinned a comment on the picture and pressed Approve, yet her Needs you
// and Today kept "Sofia: Maya, onboarding direction B as a picture..." and the
// group kept "Sofia is waiting on you here" until she pressed Mark done. Only
// writing in the group or Mark done ended the row. Measured with groupRow on
// the message, then on the same message with an approval of yours after it.
import { describe, it, expect } from 'vitest';
import { groupRow } from '../shared/room-needs-you.mjs';

const PEOPLE = [{ id: 'p-maya', name: 'Maya' }, { id: 'p-sofia', name: 'Sofia' }];
const ask = { id: 'm1', by: 'p-sofia', body: 'Maya, onboarding direction B as a picture. I think B wins.', at: 1000, mentions: [] };
const row = (over = {}) => groupRow({ roomId: 'r', roomName: 'Lumen', messages: [ask], mentioned: [], me: 'p-maya', people: PEOPLE, nameOf: () => 'Sofia', ...over });

describe('a group message that asks you about a file', () => {
  it('is in Needs you until you answer', () => {
    expect(row()).not.toBeNull();
  });
  it('ends when you approve or comment on a file in that group after it', () => {
    expect(row({ answeredAt: 2000 })).toBeNull();
  });
  it('stays when your approval came before the ask', () => {
    expect(row({ answeredAt: 500 })).not.toBeNull();
  });
});
