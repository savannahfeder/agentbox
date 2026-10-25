// A THREAD KEEPS THE NAME ITS PERSON GAVE IT.
//
// What broke, reported by a tester on 2026-10-01: they started a thread called
// "Add comment to cart.js", and while the agent worked the row's name became
// "Improve cart.js header comment", then "Update cart file comment", inside two
// minutes. They could no longer find their own threads. On a team that is worse
// again: people point each other at a thread by the name one of them wrote.
//
// How it was measured: the app's namer (main/row-label.mjs) is the only writer
// of `label`, it runs one row a tick off the supervisor, and `wantsName` said
// yes again every time anything on the row's CONTENT moved. An agent writes a
// note and a result on every run, so every run earned a fresh name.
//
// A short typed title was also left unnamed here until 2026-10-23; that made
// lists read in two styles and was dropped
// (tests/every-thread-is-named-in-the-same-style.test.mjs).
//
// WHAT CAN SILENTLY BREAK HERE:
//
//   1. `wantsName` goes back to renaming on content, and a name moves under
//      someone while they are reading the row.
//   2. `rowTitle` stops preferring a name a person wrote AFTER ours, so a
//      rename is accepted and then invisible.

import { describe, it, expect } from 'vitest';
import { rowTitle } from '../renderer/src/list-rules';
import { wantsName } from '../main/row-label.mjs';

// A dictated message, whose first line was too long to be a title and was
// clipped into one by the app. This is the row the namer exists for.
const dictated = (over = {}) => ({
  status: 'open',
  title: 'I have been clicking around the cart page for a while and I think the comment at the top of the file is…',
  body: 'I have been clicking around the cart page for a while and I think the comment at the top of the file is wrong about what the file does.',
  wrote: { title: { ts: 10, source: 'founder' } },
  ...over,
});

describe('a dictated thread is named once, and once only', () => {
  it('names it, because a clipped paragraph is not a name', () => {
    expect(wantsName(dictated())).toBe(true);
  });

  it('leaves it alone for good once it has a name', () => {
    const named = dictated({
      label: 'Cart.js header comment',
      wrote: {
        title: { ts: 10, source: 'founder' },
        label: { ts: 20, source: 'agent' },
      },
    });
    expect(wantsName(named)).toBe(false);
    // The run that used to earn a second name: a note, then a result.
    const worked = dictated({
      label: 'Cart.js header comment',
      wrote: {
        title: { ts: 10, source: 'founder' },
        label: { ts: 20, source: 'agent' },
        note: { ts: 60_000, source: 'agent' },
        result: { ts: 120_000, source: 'agent' },
      },
    });
    expect(wantsName(worked)).toBe(false);
    expect(rowTitle(worked)).toBe('Cart.js header comment');
  });

  it('leaves the archive and a wordless row alone, as it always did', () => {
    expect(wantsName(dictated({ status: 'done' }))).toBe(false);
    expect(wantsName({ status: 'open', title: '  ', body: '' })).toBe(false);
  });
});

describe('a person renaming a thread moves it, and nothing else does', () => {
  const renamed = {
    status: 'open',
    title: 'Cart page comment',
    label: 'Cart.js header comment',
    wrote: {
      label: { ts: 20, source: 'agent' },
      title: { ts: 900_000, source: 'founder' },
    },
  };

  it('draws the name they wrote, not the one we wrote before it', () => {
    expect(rowTitle(renamed)).toBe('Cart page comment');
  });

  it('does not answer their rename with a name of our own', () => {
    expect(wantsName(renamed)).toBe(false);
  });

  it('still draws our name while it is the newest one on the row', () => {
    expect(rowTitle({
      title: 'I have been clicking around the cart page for a while and I think…',
      label: 'Cart.js header comment',
      wrote: { title: { ts: 10, source: 'founder' }, label: { ts: 20, source: 'agent' } },
    })).toBe('Cart.js header comment');
  });

  it('is unchanged on every row that has no stamps at all', () => {
    expect(rowTitle({ title: 'Her words', label: 'A name' })).toBe('A name');
    expect(rowTitle({ title: 'Her words' })).toBe('Her words');
    for (const label of ['', '   ', '\n', '\t ']) {
      expect(rowTitle({ title: 'Her words', label })).toBe('Her words');
    }
  });
});
