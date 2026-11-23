// On the helper's copy, a comment sent to the owner's agent read "To the agent" only while the ask was open; once handed back it read "Comment, did not start the agent" until the owner's copy republished (power test issue 64).
// Measured on shownOnTheirThread with the helper's ask rows: the label now follows whether a help ask covered the comment when it was written.
import { it, expect, describe } from 'vitest';
import fs from 'node:fs';
import { itemThread } from '../renderer/src/item-thread';
import { messageKind } from '../renderer/src/threads/message-kind';
import { helpedWhen, shownOnTheirThread } from '../renderer/src/threads/teammate-thread';
import { GIVEN_TASK } from '../shared/team-rules.mts';

const line = (ts, patch, extra = {}) => ({ id: 'w-1', ts, source: 'founder', patch, ...extra });
const comment = (ts, text) => line(ts, { comment: { text } }, { source: 'system', by: 'priya', uid: `comment-${ts}` });
const thread = [line(1, { body: 'Currency check.' }, { by: 'sam' }), comment(50, 'Before I was asked.'), comment(1000, 'The front desk line.'), comment(3000, 'After I handed back.')];
const said = () => itemThread(thread, [], null, { whole: true }).events.filter((e) => e.kind !== 'work' && e.kind !== 'run');
const ask = (o = {}) => ({ id: 'k', product: 'dm', labels: [GIVEN_TASK], assignee: 'priya', createdBy: 'sam', createdAt: 500, status: 'open', ask: { kind: 'help', owner: 'sam', thread: 'w-1', product: 'api' }, ...o });
const handedBack = ask({ status: 'done', wrote: { status: { ts: 2000, by: 'priya' } } });
const label = (rows, text) => {
  const shown = shownOnTheirThread(said(), { me: 'priya', helping: (at) => helpedWhen(rows, 'priya', 'sam', 'w-1', at) });
  return messageKind(shown.find((e) => (e.text ?? '').includes(text)));
};

describe("the helper's own comment on the owner's thread", () => {
  it('stays to the agent after the ask is handed back, when the ask covered it', () => {
    expect(label([handedBack], 'front desk')).toEqual({ word: 'To the agent' });
  });
  it('reads as to the agent while the ask is open', () => {
    expect(label([ask()], 'front desk')).toEqual({ word: 'To the agent' });
  });
  it('is a comment when written after the hand-back, or before the ask', () => {
    expect(label([handedBack], 'After I handed')).toEqual({ word: 'Comment', why: 'did not start the agent' });
    expect(label([handedBack], 'Before I was asked')).toEqual({ word: 'Comment', why: 'did not start the agent' });
  });
  it('is a comment under a review ask, an ask on another thread, or an ask of someone else', () => {
    expect(label([ask({ ask: { kind: 'review', owner: 'sam', thread: 'w-1', product: 'api' } })], 'front desk')).toEqual({ word: 'Comment', why: 'did not start the agent' });
    expect(label([ask({ ask: { kind: 'help', owner: 'sam', thread: 'w-2', product: 'api' } })], 'front desk')).toEqual({ word: 'Comment', why: 'did not start the agent' });
    expect(label([ask({ assignee: 'theo' })], 'front desk')).toEqual({ word: 'Comment', why: 'did not start the agent' });
    expect(label([], 'front desk')).toEqual({ word: 'Comment', why: 'did not start the agent' });
  });
});

it('the page asks the rows, not only the open ask', () => {
  const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  expect(read('renderer/src/App.tsx')).toContain('helpedAt={(at) => helpedWhen(items, team?.me ?? null, openCard.personId, openCard.threadId, at)}');
});
