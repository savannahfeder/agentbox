// A REPLY BRINGS A CLOSED CONVERSATION BACK, EVEN ACROSS YOUR DONE.
//
// A reply only reopens a conversation if the sender's Mac has seen it closed:
// `statusForReply` writes the reopen. In round one Dev pressed Done while
// Jordan's reply was on its way. Jordan's Mac had no Done to undo, so its line
// carried no status, and the row stayed closed on Dev's Mac. The reply was on no
// list anyone reads. Replaying the 17 real lines of that conversation showed the
// question reached Dev only when he went looking.
//
// Both crossings: a reply stamped after the Done, and one stamped before it that
// reached this Mac after it.
import { describe, it, expect } from 'vitest';
import { foldWorkItems } from '../shared/work-items.mts';
import { inMyInbox, iSpokeLast, whatWaits } from '../shared/team-rules.mts';

const ID = 'w-0123456789';
const DEV = 'p-dev', JORDAN = 'p-jordan', MAYA = 'p-maya';
const DIRECT = { slug: 'direct-c0ffee03', name: 'Direct', team: { projectId: 'c0ffee03', teamId: 't1', people: [DEV, JORDAN, MAYA], sharedBy: DEV, direct: true } };
const line = (by, ts, uid, patch) => ({ id: ID, ts, source: 'founder', by, uid, patch });
const open = (ts = 100) => line(JORDAN, ts, 'u-open', { title: 'Bookings', body: 'Is the fix live?', status: 'open', kind: 'directive', people: [JORDAN, DEV, MAYA] });
const say = (by, ts, uid, text, extra = {}) => line(by, ts, uid, { answer: text, ...extra });
const done = (by, ts, uid = 'u-done') => line(by, ts, uid, { status: 'done' });
const fold = (lines) => foldWorkItems(lines).get(ID);
const waiting = (item, who) => inMyInbox(item, DIRECT, who);

describe('your Done, and a reply from a Mac that had not seen it', () => {
  const crossed = () => fold([open(), say(DEV, 200, 'u-a', 'Yes.'), done(DEV, 300), say(JORDAN, 310, 'u-b', 'Thanks. Does it cover groups?')]);

  it('brings it back for you, with their words on it', () => {
    const item = crossed();
    expect(item.status).toBe('open');
    expect(waiting(item, DEV)).toBe(true);
    expect(whatWaits(item, DEV).chat).toBe(1);
  });

  it('is done for them, since they spoke last', () => {
    const item = crossed();
    expect(waiting(item, JORDAN)).toBe(false);
    expect(iSpokeLast(item, DIRECT, JORDAN)).toBe(true);
  });

  it('also when it was written before your Done and reached you after', () => {
    const item = fold([open(), say(DEV, 200, 'u-a', 'Yes.'), done(DEV, 300), say(JORDAN, 290, 'u-b', 'Does it cover groups?')]);
    expect(item.status).toBe('open');
    expect(waiting(item, DEV)).toBe(true);
    expect(whatWaits(item, DEV).chat).toBe(1);
  });

  it('counts a reply in a side thread', () => {
    const item = fold([open(), say(DEV, 200, 'u-a', 'Yes.'), done(DEV, 300), say(JORDAN, 310, 'u-b', 'Groups too?', { inReplyTo: 'u-a' })]);
    expect(item.status).toBe('open');
    expect(whatWaits(item, DEV).threads).toHaveLength(1);
  });
});

describe('what must stay closed', () => {
  it('a message you had already seen when you pressed Done', () => {
    const item = fold([open(), say(JORDAN, 200, 'u-b', 'Does it cover groups?'), done(DEV, 300)]);
    expect(item.status).toBe('done');
    expect(waiting(item, DEV)).toBe(false);
  });

  it('a reply that crossed one Done, once you press Done again', () => {
    const item = fold([open(), done(DEV, 300), say(JORDAN, 290, 'u-b', 'Groups?'), say(JORDAN, 310, 'u-c', 'And classes?'), done(DEV, 400, 'u-done-2')]);
    expect(item.status).toBe('done');
    expect(waiting(item, DEV)).toBe(false);
  });

  it('your own message after your own Done, which the app reopens itself', () => {
    const item = fold([open(), done(DEV, 300), say(DEV, 310, 'u-d', 'Heads up.')]);
    expect(item.status).toBe('done');
  });

  it('a reaction, which is not somebody writing', () => {
    const item = fold([open(), say(DEV, 200, 'u-a', 'Yes.'), done(DEV, 300), line(JORDAN, 310, 'u-r', { react: { on: 'u-a', emoji: '👍' } })]);
    expect(item.status).toBe('done');
  });

  it('a row with no people on it', () => {
    const item = foldWorkItems([
      { id: ID, ts: 100, source: 'founder', by: DEV, uid: 'u-1', patch: { title: 'Mine', body: 'x', status: 'open' } },
      { id: ID, ts: 200, source: 'founder', by: DEV, uid: 'u-2', patch: { status: 'done' } },
      { id: ID, ts: 300, source: 'founder', by: JORDAN, uid: 'u-3', patch: { answer: 'y' } },
    ]).get(ID);
    expect(item.status).toBe('done');
  });

  it('nobody else loses their own place: a third person who wrote last is still waited on by you', () => {
    const item = fold([open(), done(DEV, 300), say(MAYA, 310, 'u-m', 'I can check.')]);
    expect(waiting(item, DEV)).toBe(true);
    expect(waiting(item, MAYA)).toBe(false);
  });
});
