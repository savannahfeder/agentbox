// Renaming an open thread changed the breadcrumb but not the big heading above
// the conversation. Measured in the browser copy: the heading is the
// one-at-a-time page's `h2.one-title`, drawn from the copy of the row the pane
// holds. A rename writes only `label`, and a label alone is not news, so it
// leaves `updatedAt` where it was; the pane takes a newer copy only when
// `updatedAt` moves, so it kept the old name. The crumb showed the new one only
// because it holds what was typed until the row catches up.
// Here: the real ledger fold, the pane's rule for taking a newer copy, and the
// name the heading draws.
import { describe, it, expect } from 'vitest';
import { foldWorkItems } from '../shared/work-items.mts';
import { freshCopy } from '../renderer/src/stay-with-a-command';
import { pageTitle } from '../renderer/src/one-thing-at-a-time';
import { itemThread } from '../renderer/src/item-thread';

const ID = 'w-0123456789';
const TYPO = 'add a rate limter to the login handler';
const FIXED = 'add a rate limiter to the login handler';
const T = 1_790_000_000_000;

const sent = [
  { id: ID, ts: T, source: 'system', patch: { title: TYPO, status: 'open', kind: 'directive', priority: 5, labels: ['founder'] } },
  { id: ID, ts: T + 3, source: 'founder', patch: { title: TYPO, model: 'opus' } },
  { id: ID, ts: T + 300_000, source: 'agent', patch: { result: `Done: ${TYPO}.` } },
];
const rename = (label, ts) => ({ id: ID, ts, source: 'founder', patch: { label } });
const row = (lines) => ({ ...foldWorkItems(lines).get(ID), product: 'backend' });

describe('a rename reaches the open thread', () => {
  const opened = row(sent);
  const renamed = row([...sent, rename(FIXED, T + 600_000)]);

  it('the rename leaves updatedAt where it was, which is why the pane missed it', () => {
    expect(renamed.updatedAt).toBe(opened.updatedAt);
    expect(renamed.label).toBe(FIXED);
  });

  it('the pane takes the renamed copy', () => {
    expect(freshCopy([renamed], opened, null)).toBe(renamed);
  });

  it('and its heading reads the new name', () => {
    expect(pageTitle(opened)).toBe(TYPO);
    expect(pageTitle(freshCopy([renamed], opened, null))).toBe(FIXED);
  });

  it('a second rename reaches it too', () => {
    const again = row([...sent, rename(FIXED, T + 600_000), rename('Rate limit the login handler', T + 700_000)]);
    expect(again.updatedAt).toBe(renamed.updatedAt);
    expect(pageTitle(freshCopy([again], renamed, null))).toBe('Rate limit the login handler');
  });

  it('your first message under the heading keeps the words you sent', () => {
    const { events } = itemThread([...sent, rename(FIXED, T + 600_000)], [], null, { whole: true });
    const said = events.filter((e) => e.kind !== 'work' && e.kind !== 'run').map((e) => e.text ?? '');
    expect(said[0]).toBe(TYPO);
    expect(said.some((t) => t.includes(FIXED))).toBe(false);
  });
});

describe('what still does not move the pane', () => {
  it('a poll of an unrenamed thread, which reads as it always did', () => {
    const opened = row(sent);
    const polled = row(sent);
    expect(polled).not.toBe(opened);
    expect(freshCopy([polled], opened, null)).toBe(null);
    expect(pageTitle(opened)).toBe(TYPO);
  });

  it('a poll of a renamed thread whose name has not changed since', () => {
    const lines = [...sent, rename(FIXED, T + 600_000)];
    expect(freshCopy([row(lines)], row(lines), null)).toBe(null);
  });
});
