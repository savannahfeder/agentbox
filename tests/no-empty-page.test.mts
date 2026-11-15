// THERE IS NO NOTHING-HERE PAGE.
//
// Two separate faults were under that one sentence, so there are two halves
// here.
//
//  1. THE PAGE VANISHED UNDER THE CARD. `inboxZero` in App.tsx carried `!modal`,
//     so opening anything at inbox zero swapped the whole idle page out for the
//     ordinary list, and an ordinary list with an empty inbox drew "Nothing
//     here." behind whatever she had just opened. This is the half her
//     screenshot is of.
//  2. THE SENTENCE ITSELF. Every view drew one when it had nothing in it, and
//     so did the card under it. Both are gone.
//
// The rendering half is rendered, not grepped: List is called with no items and
// the markup it returns is read. The App half is read out of the source,
// because the condition it is about is one line of a component that needs the
// whole app around it to mount.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { List } from '../renderer/src/components/List.tsx';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const app = read('renderer/src/App.tsx');
const css = read('renderer/src/styles.css');

const draw = (props) => renderToStaticMarkup(createElement(List, {
  items: [], view: 'inbox', selected: 0, seen: new Set(), running: [],
  multiSel: new Set(), onSelect: () => {}, onOpen: () => {}, onToggle: () => {},
  onRange: () => {}, ...props,
}));

describe('a view with nothing in it draws nothing', () => {
  it('draws no markup at all on the inbox', () => {
    expect(draw({ view: 'inbox' })).toBe('');
  });

  it('draws no markup at all on In progress, Scheduled or Closed', () => {
    for (const view of ['progress', 'snoozed', 'done']) {
      expect(draw({ view })).toBe('');
    }
  });

  it('says neither of the two sentences it used to say', () => {
    for (const view of ['inbox', 'progress', 'snoozed', 'done']) {
      const html = draw({ view });
      expect(html).not.toMatch(/Nothing here/);
      expect(html).not.toMatch(/Nothing running/);
    }
  });

  // SEARCH IS THE ONE THING THAT IS NOT AN EMPTY PAGE. She typed something and
  // the app has to say what it matched; the line is hers, from (2026-08-18). A
  // blank window on a query would read as the search having emptied her inbox.
  it('still answers a search that matched nothing', () => {
    const html = draw({ emptyText: 'Nothing matches “conversion”.' });
    expect(html).toMatch(/Nothing matches/);
  });
});

// THE WHOLE-PAGE INBOX ZERO WENT WITH THE LAYOUT WITHOUT A SIDEBAR
// (w-a1ed0e8b25). The sidebar layout keeps the Inbox's tabs on screen with
// nothing in them and draws its zero under them (threads/Pages.tsx,
// InboxClear), so nothing swaps the page out, under a modal or otherwise.
describe('an empty inbox keeps its page', () => {
  it('has no whole-page zero to swap in', () => {
    expect(app).not.toMatch(/const inboxEmpty = /);
    expect(app).not.toContain('<IdlePage');
    expect(fs.existsSync(path.join(root, 'renderer/src/components/IdlePage.tsx'))).toBe(false);
  });

  it('draws its zero under the tabs, in the list\'s place', () => {
    expect(app).toMatch(/\(emptyView && !theirRows\.length[\s\S]{0,1400}<InboxClear/);
  });

  it('leaves nothing gated on the modal', () => {
    expect(app).not.toMatch(/const inboxZero = /);
    expect(app).not.toMatch(/gameShowingRef/);
  });

  // The sidebar layout's pane never draws a card (workspace-navigation.css), so
  // an empty one has no card to take away.
  it('draws no card under an empty view', () => {
    expect(read('renderer/src/workspace-navigation.css')).toContain(':root .workspace-layout > .body > .list-pane { background: none; border: 0; box-shadow: none; backdrop-filter: none;');
    expect(css).not.toMatch(/\.list-pane\.bare/);
  });
});
