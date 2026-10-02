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

describe('the inbox zero page stays up under an overlay', () => {
  it('does not take a modal into account when deciding the inbox is empty', () => {
    const line = app.match(/const inboxEmpty = .*/)?.[0];
    expect(line, 'App.tsx no longer computes inboxEmpty').toBeTruthy();
    // The regression, exactly: `!modal` back in this condition is her bug back.
    expect(line).not.toMatch(/modal/);
    expect(line).toMatch(/view === 'inbox'/);
    expect(line).toMatch(/inbox\.length === 0/);
  });

  it('draws the idle page, not the list, whenever the inbox is empty', () => {
    expect(app).toMatch(/\{inboxEmpty \? \(/);
  });

  // The page has one rule. This guards against a second, modal-gated
  // condition being reintroduced without a reader.
  it('leaves nothing gated on the modal any more', () => {
    expect(app).not.toMatch(/const inboxZero = /);
    expect(app).not.toMatch(/gameShowingRef/);
  });
});

describe('an empty view draws no card either', () => {
  it('marks the pane bare when there is nothing in it and no search', () => {
    const line = app.match(/const bareView = [\s\S]*?;\n/)?.[0];
    expect(line, 'App.tsx no longer computes bareView').toBeTruthy();
    expect(line).toMatch(/search === null/);
    expect(line).toMatch(/list\.length === 0/);
    expect(app).toMatch(/bareView \? ' bare' : ''/);
  });

  it('takes the fill and the shadow off that pane in a plain theme', () => {
    const rule = css.match(/\n\.list-pane\.bare \{[^}]*\}/)?.[0];
    expect(rule, 'styles.css no longer has the bare pane rule').toBeTruthy();
    expect(rule).toMatch(/background: none;/);
    expect(rule).toMatch(/box-shadow: none;/);
  });

  // The skinned pane adds a wash, a hairline and a blur, and it outranks a bare
  // class, so its twin is written out beside it. A blurred nothing is still a
  // rectangle you can see the edges of.
  it('takes the wash, the hairline and the blur off it under a picture', () => {
    const rule = css.match(/:root\[data-skin\] \.list-pane\.bare \{[^}]*\}/)?.[0];
    expect(rule, 'styles.css no longer has the skinned bare pane rule').toBeTruthy();
    expect(rule).toMatch(/background: none;/);
    expect(rule).toMatch(/border: 0;/);
    expect(rule).toMatch(/backdrop-filter: none;/);
  });
});
