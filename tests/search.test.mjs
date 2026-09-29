// Task search: what a query keeps, and what the kept row says.
//
// The chosen design was B, the corner magnifier and `/`, and three of its
// properties are the ones a regression would be silent about, because a search
// that quietly misses things looks exactly like a store that does not contain
// them:
//
//   - Closed rows are IN. In a real store almost every task is closed. A search
//     that dropped them would return a sliver of the rows and look like it worked.
//   - The BODY and the RESULT are read, not the title. Titles are labels; the
//     sentence somebody remembers is usually further in.
//   - The row's summary is the sentence the word was found in. This is the only
//     evidence on screen that the row belongs in the list at all.

import { describe, expect, it } from 'vitest';
import {
  hitSummary,
  matchedSentence,
  matches,
  queryTerms,
  searchItems,
  splitHits,
} from '../renderer/src/search.ts';

const titled = {
  id: 'a',
  title: 'Your conversion rate is 0.4 percent',
  body: 'The number came out of the ledger this morning.',
  status: 'open',
  updatedAt: 300,
};
const buried = {
  id: 'b',
  title: 'Not reading the five: they are all ours',
  body: 'They were all our own sessions. The 11 August conversion report now opens with a correction box saying this.',
  status: 'open',
  updatedAt: 200,
};
const closed = {
  id: 'c',
  title: 'Drive session: nothing filed',
  body: 'Ran the drive.',
  result: 'The one real bottleneck, the conversion rate dying at the first click, is option 3 on w-3b8329d630.',
  status: 'done',
  updatedAt: 100,
};
const unrelated = { id: 'd', title: 'Pick a dark palette', body: 'Five of them, drawn in the real app.', status: 'open', updatedAt: 400 };

const all = [titled, buried, closed, unrelated];

describe('queryTerms', () => {
  it('splits on whitespace and lowercases', () => {
    expect(queryTerms('  Conversion   Rate ')).toEqual(['conversion', 'rate']);
  });
  it('is empty for an empty query, so nothing matches before she types', () => {
    expect(queryTerms('   ')).toEqual([]);
  });
});

describe('matches', () => {
  it('reads the title', () => {
    expect(matches(titled, ['conversion'])).toBe(true);
  });
  it('reads the body, not just the title', () => {
    expect(matches(buried, ['conversion'])).toBe(true);
  });
  // The row that would be missed by a search over open work only, which is
  // most of a real store.
  it('reads the result of a CLOSED task', () => {
    expect(matches(closed, ['conversion'])).toBe(true);
    expect(closed.status).toBe('done');
  });
  it('is case-insensitive', () => {
    expect(matches(buried, ['AUGUST'])).toBe(true);
  });
  it('sees through markdown, so a bolded word still matches', () => {
    expect(matches({ id: 'x', body: 'The **conversion** rate.' }, ['conversion'])).toBe(true);
  });
  // AND, not OR: the second word has to narrow, or typing more returns more.
  it('requires every term', () => {
    expect(matches(titled, ['conversion', 'percent'])).toBe(true);
    expect(matches(titled, ['conversion', 'kangaroo'])).toBe(false);
  });
  it('matches nothing on an empty query', () => {
    expect(matches(titled, [])).toBe(false);
  });
});

describe('searchItems', () => {
  it('keeps every project and every status, newest first', () => {
    const hits = searchItems(all, 'conversion');
    expect(hits.map((h) => h.item.id)).toEqual(['a', 'b', 'c']);
  });
  // An empty filter passes everything; a blank field used to blank the screen.
  it('shows every task before she has typed anything, newest first', () => {
    expect(searchItems(all, '').map((h) => h.item.id)).toEqual(['d', 'a', 'b', 'c']);
  });
  it('gives an untyped row its ordinary summary, not a match sentence', () => {
    const hit = searchItems(all, '').find((h) => h.item.id === 'a');
    expect(hit.summary).toBe('The number came out of the ledger this morning.');
  });
  it('narrows from everything the moment she types', () => {
    expect(searchItems(all, '').length).toBe(4);
    expect(searchItems(all, 'conversion').length).toBe(3);
  });
  it('narrows as a second word is typed', () => {
    expect(searchItems(all, 'conversion august').map((h) => h.item.id)).toEqual(['b']);
  });
});

describe('the row says why it matched', () => {
  it('summarises a body hit with the sentence the word is in', () => {
    expect(hitSummary(buried, ['conversion']))
      .toBe('The 11 August conversion report now opens with a correction box saying this.');
  });
  it('reads a finished row\'s result first, the way the row does at rest', () => {
    expect(hitSummary(closed, ['conversion'])).toContain('the conversion rate dying at the first click');
  });
  // The title is already on screen with the match lit up in it.
  it('falls back to the ordinary summary when only the title matched', () => {
    const t = { id: 'e', title: 'Kangaroo', body: 'Nothing about that here.', status: 'open' };
    expect(hitSummary(t, ['kangaroo'])).toBe('Nothing about that here.');
  });
});

describe('matchedSentence', () => {
  it('picks the sentence containing the word, not the first sentence', () => {
    const text = 'One. Two. The word is conversion. Four.';
    expect(matchedSentence(text, ['conversion'])).toBe('The word is conversion.');
  });
  // Clipping from the left is what the row does at rest, and it is wrong here:
  // it cuts out the very word that put the row in the list.
  it('keeps the match visible in a sentence longer than the budget', () => {
    const long = `${'padding words here '.repeat(12)}conversion happened at the end.`;
    const out = matchedSentence(long, ['conversion']);
    expect(out.toLowerCase()).toContain('conversion');
    expect(out.length).toBeLessThanOrEqual(120);
    expect(out.startsWith('…')).toBe(true);
  });
  it('is empty when the text does not contain the term', () => {
    expect(matchedSentence('Nothing here.', ['conversion'])).toBe('');
  });
});

describe('splitHits', () => {
  it('splits a line into matched and unmatched runs', () => {
    expect(splitHits('the conversion rate', ['conversion'])).toEqual([
      { text: 'the ', hit: false },
      { text: 'conversion', hit: true },
      { text: ' rate', hit: false },
    ]);
  });
  it('lights every occurrence', () => {
    const runs = splitHits('conversion and conversion', ['conversion']);
    expect(runs.filter((r) => r.hit).length).toBe(2);
  });
  it('matches whatever case she typed', () => {
    expect(splitHits('Conversion', ['conversion'])).toEqual([{ text: 'Conversion', hit: true }]);
  });
  // Two terms where one contains the other used to nest, which double-inked the
  // overlap and read as a different weight again.
  it('merges overlapping terms into one run', () => {
    expect(splitHits('conversion', ['con', 'conversion'])).toEqual([{ text: 'conversion', hit: true }]);
  });
  it('leaves an unmatched line whole', () => {
    expect(splitHits('nothing here', ['conversion'])).toEqual([{ text: 'nothing here', hit: false }]);
  });
  // Never loses a character: the row prints these runs and nothing else.
  it('reassembles to exactly the original text', () => {
    const text = 'A conversion, then another Conversion, then none.';
    expect(splitHits(text, ['conversion', 'none']).map((r) => r.text).join('')).toBe(text);
  });
});
