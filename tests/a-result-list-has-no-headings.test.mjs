// Search results are one unbroken list, best first, with nothing written over
// them.
//
// That round drew "Best matches" over the top of the list and "Also mentions
// these words" over the rest, and captioned any line lifted out of her own
// reply with "You said: ". The ranking is the whole feature and all three of
// those were text on top of it.
//
// This is a rendering test rather than a source one because the failure it
// guards is visual: a day label that comes back, a heading that comes back, or
// an empty label div that draws a band of nothing above the first result.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { List } from '../renderer/src/components/List.tsx';
import { searchItems } from '../renderer/src/search.ts';
import { Name } from '../shared/product-name.mjs';

const now = Date.now();
const day = 86_400_000;

// Three rows a day apart, so a list grouped by day would draw three labels, and
// two of them say the phrase so a banded list would draw two headings.
const items = [
  {
    id: 'a', status: 'done', updatedAt: now,
    title: 'How to Work is merged and your app already has it',
    result: 'The app booted at 1pm today, after all of it.',
    product: 'agentbox', productName: Name,
  },
  {
    id: 'b', status: 'open', updatedAt: now - day,
    title: 'Measure the instructions you were handed this session',
    body: 'The How to work section is 20,802 characters, measured again from scratch.',
    product: 'agentbox', productName: Name,
  },
  {
    id: 'c', status: 'open', updatedAt: now - day * 3,
    title: 'Right now we only have one special theme',
    body: 'How many variants should there be, and do we have to ship the work this week?',
    product: 'agentbox', productName: Name,
  },
];

const draw = (props) => renderToStaticMarkup(createElement(List, {
  items, view: 'inbox', selected: 0, seen: new Set(), running: [],
  multiSel: new Set(), onSelect: () => {}, onOpen: () => {}, onToggle: () => {},
  onRange: () => {}, ...props,
}));

const hits = searchItems(items, 'how to work');
const searching = {
  items: hits.map((h) => h.item),
  summaries: new Map(hits.map((h) => [h.item.id, h.summary])),
  terms: ['how', 'to', 'work'],
  phrase: 'how to work',
  ranked: true,
};

describe('a ranked list', () => {
  it('draws no day label element at all', () => {
    expect(draw(searching)).not.toContain('day-label');
  });

  it('says none of the three words it used to write over the rows', () => {
    const html = draw(searching);
    expect(html).not.toContain('Best matches');
    expect(html).not.toContain('Also mentions');
    expect(html).not.toContain('Results');
  });

  it('captions no row with whose words they were', () => {
    expect(draw(searching)).not.toContain('You said');
  });

  it('still draws every row, in match order, with the matches lit', () => {
    const html = draw(searching);
    for (const item of items) expect(html).toContain(item.title);
    expect(html.indexOf('How to Work is merged')).toBeLessThan(html.indexOf('Right now we only have'));
    expect(html).toContain('class="hit"');
  });

  it('still prints each row its own time, so nothing about when is lost', () => {
    // The day labels came off; the time on the right of every row did not.
    expect(draw(searching).match(/class="time"/g).length).toBe(items.length);
  });
});

// THE ORDINARY LIST IS ONE LIST TOO NOW. Her pick, 2026-09-10, out of three
// drawings of her own inbox: "the list without date headings is best: one
// list, no date headings." So these three rows a day apart are one group,
// which is what gives every one of them the hairline.
describe('a list that has not been ranked', () => {
  it('draws no date heading on the inbox, in progress or closed', () => {
    for (const view of ['inbox', 'progress', 'done']) {
      const html = draw({ view });
      expect(html).not.toContain('day-label');
      expect(html).not.toContain('Yesterday');
    }
  });

  it('still prints each row its own time', () => {
    expect(draw({}).match(/class="time"/g).length).toBe(items.length);
  });

  it('keeps the Returns headings on Scheduled, where the heading is the schedule', () => {
    expect(draw({ view: 'snoozed' })).toContain('Returns');
  });
});
