// NOTHING FROM BEFORE YOU JOINED IS SHARED UNLESS YOU SHARE IT (2026-10-01).
// Someone who moves an existing store onto the team version may bring hundreds
// of threads written for nobody but themselves. The first sign-in must not put
// a summary of every one of them on the team's board.
import { it, expect, describe } from 'vitest';
import { cardsFor, shownToTeam } from '../shared/thread-cards.mjs';
import { memorySyncState } from '../main/team/sync.mjs';
import { teamEntries } from '../renderer/src/threads/page-rules.ts';

const SINCE = 1_000_000;
const row = (id, createdAt, extra = {}) => ({ id, product: 'nw', title: `Thread ${id}`, status: 'open', createdAt, updatedAt: createdAt, ...extra });

describe('shownToTeam', () => {
  it('keeps a thread from before you joined to yourself', () => expect(shownToTeam(row('a', SINCE - 1), SINCE)).toBe(false));
  it('shows a thread started after you joined', () => expect(shownToTeam(row('b', SINCE + 1), SINCE)).toBe(true));
  it('shows an old thread you shared by hand', () => expect(shownToTeam(row('c', SINCE - 1, { visibility: 'team' }), SINCE)).toBe(true));
  it('never shows a private one', () => expect(shownToTeam(row('d', SINCE + 1, { visibility: 'private' }), SINCE)).toBe(false));
  it('keeps the old rule when nobody has joined yet', () => expect(shownToTeam(row('e', 5), null)).toBe(true));
});

it('publishes only what is shown, and never names a hidden thread in a link', () => {
  const products = [{ slug: 'nw', name: 'Northwind', team: null }];
  const items = [row('old', SINCE - 10), row('new', SINCE + 10, { blockedBy: ['old'] }), row('shared', SINCE - 5, { visibility: 'team' })];
  const cards = cardsFor({ products, readItems: () => items, now: SINCE + 100, since: SINCE });
  expect(cards.map((c) => c.threadId).sort()).toEqual(['new', 'shared']);
  expect(cards.find((c) => c.threadId === 'new').blockedBy).toEqual([{ id: 'old', title: null }]);
});

it('remembers when sharing began, once', () => {
  const kept = memorySyncState();
  expect(kept.getSince('p1')).toBeNull();
  kept.setSince('p1', 42);
  expect(kept.getSince('p1')).toBe(42);
});

it('leaves your old threads off your own Team board, but keeps a private one with its lock', () => {
  const products = [{ slug: 'nw', name: 'Northwind', team: null }];
  const items = [row('old', SINCE - 10), row('new', SINCE + 10), row('hid', SINCE - 10, { visibility: 'private' })];
  const ids = teamEntries({ items, products, cards: [], me: 'me', now: SINCE + 100, since: SINCE }).map((e) => e.item?.id).sort();
  expect(ids).toEqual(['hid', 'new']);
});
