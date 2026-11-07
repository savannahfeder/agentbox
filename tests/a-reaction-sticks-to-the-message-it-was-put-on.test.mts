// A REACTION STICKS TO THE MESSAGE IT WAS PUT ON, AND TWO OF THEM NEVER
// CLOBBER EACH OTHER.
//
// Drawing A of the messages redesign (w-2e8aa16f0f) puts small square chips
// under a message: an emoji, a count, and yours a shade brighter. The chips
// have to survive the one thing the ledger does to every other field, which is
// keep the latest write and drop the rest. A reaction written as an ordinary
// field would do exactly that: Maya's 👀 lands, yours lands a second later on
// the same field, and hers is gone off both Macs.
//
// So a reaction is a DELTA — which message, which emoji, and whether it is on
// or off — and the fold accumulates them per person. Measured here: two people
// on one message keep two chips; the same person twice is one chip; taking one
// back leaves the other person's standing; and a line that arrives out of
// order (a pull is a page of a teammate's lines, newest-first is possible)
// cannot resurrect a reaction that was taken back later.
import { describe, it, expect } from 'vitest';
import { foldWorkItems, pickFields } from '../shared/work-items.mjs';
import { whatATeammateMaySet } from '../shared/team-rules.mjs';

const ID = 'w-1234567890';
const MSG = 'u-msg-one';
const OTHER = 'u-msg-two';
let clock = 1_000;
const react = (by, on, emoji, { off = false, ts = (clock += 1000) } = {}) => ({
  id: ID, ts, source: 'founder', by, uid: `u-r-${ts}-${by}`,
  patch: { react: off ? { on, emoji, off: true } : { on, emoji } },
});
const said = (by, text, ts = (clock += 1000)) => ({ id: ID, ts, source: 'founder', by, uid: `u-${ts}`, patch: { answer: text } });
const fold = (lines) => foldWorkItems(lines).get(ID);

describe('a reaction on a message', () => {
  it('reads back under the message it was put on', () => {
    const item = fold([said('p-maya', 'hi'), react('p-me', MSG, '👀')]);
    expect(item.reactions).toEqual({ [MSG]: { '👀': ['p-me'] } });
  });

  it('keeps both people when two react to the same message', () => {
    const item = fold([react('p-maya', MSG, '👀'), react('p-me', MSG, '👀')]);
    expect(item.reactions[MSG]['👀']).toEqual(['p-maya', 'p-me']);
  });

  it('counts one person once however many times they press it', () => {
    const item = fold([react('p-me', MSG, '👀'), react('p-me', MSG, '👀')]);
    expect(item.reactions[MSG]['👀']).toEqual(['p-me']);
  });

  it('takes only your own back, and leaves the chip when somebody else is still on it', () => {
    const item = fold([react('p-maya', MSG, '👀'), react('p-me', MSG, '👀'), react('p-me', MSG, '👀', { off: true })]);
    expect(item.reactions[MSG]['👀']).toEqual(['p-maya']);
  });

  it('drops the chip entirely when the last person takes theirs back', () => {
    const item = fold([react('p-me', MSG, '👀'), react('p-me', MSG, '👀', { off: true })]);
    expect(item.reactions).toBeUndefined();
  });

  it('holds several emoji on one message and several messages on one row', () => {
    const item = fold([react('p-me', MSG, '👀'), react('p-me', MSG, '🙏'), react('p-maya', OTHER, '👍')]);
    expect(item.reactions).toEqual({ [MSG]: { '👀': ['p-me'], '🙏': ['p-me'] }, [OTHER]: { '👍': ['p-maya'] } });
  });

  // THE BOUNDARY EITHER SIDE OF THE ORDER THEY ARRIVE IN. A pull hands over a
  // page of a teammate's lines, and nothing promises the page is in the order
  // the person pressed them. The newest press wins by its own timestamp, not by
  // where it sits in the file.
  it('lets the newest press win whichever order the lines arrive in', () => {
    const on = react('p-me', MSG, '👀', { ts: 5_000 });
    const off = react('p-me', MSG, '👀', { off: true, ts: 6_000 });
    expect(fold([off, on]).reactions).toBeUndefined();
    expect(fold([on, off]).reactions).toBeUndefined();
  });

  it('does not change who the conversation is waiting on', () => {
    const item = fold([said('p-maya', 'hi'), react('p-me', MSG, '👀')]);
    expect(item.wrote.answer.by).toBe('p-maya');
    expect(item.react).toBeUndefined();
  });

  // AND THE CASE THAT MUST NOT BE STORED AT ALL.
  it('refuses a reaction with no message, no emoji, or an emoji that is a paragraph', () => {
    expect(pickFields({ react: { emoji: '👀' } })).toBe(null);
    expect(pickFields({ react: { on: MSG } })).toBe(null);
    expect(pickFields({ react: 'nope' })).toBe(null);
    expect(pickFields({ react: { on: MSG, emoji: 'x'.repeat(500) } }).react.emoji.length).toBeLessThanOrEqual(8);
  });
});

describe('a reaction reaches the other Mac', () => {
  it('rides a teammate’s line in a conversation', () => {
    const line = { id: ID, ts: 1, source: 'founder', by: 'p-maya', uid: 'u-1', patch: { react: { on: MSG, emoji: '👀' } } };
    expect(whatATeammateMaySet(line, { direct: true }).patch.react).toEqual({ on: MSG, emoji: '👀' });
  });

  // AND NOWHERE ELSE. Outside a conversation a teammate's line may set only the
  // summary and who acts next (shared/team-rules.mjs); a reaction is not one of
  // them, and nothing in the app draws one there.
  it('is dropped from a teammate’s line on an ordinary shared task', () => {
    const line = { id: ID, ts: 1, source: 'founder', by: 'p-maya', uid: 'u-1', patch: { react: { on: MSG, emoji: '👀' } } };
    expect(whatATeammateMaySet(line)).toBe(null);
  });
});
