// ⌘K offers filtering as ONE line, however many projects she has, and the
// corner shows a tag for each part of a filter that is on.
//
// w-aa3fa4cbf0: filtering is one Filter line that opens the rest. With 20
// projects, the palette used to draw a "Go to <project>" row for every one of
// them plus "All products", 21 rows for one job, which fills the whole menu.
//
// The priority names in the menu are capitalized, because lowercase looks odd.
// And a filter that is on leaves a tag in the corner, because it is easy to
// forget you are in a filtered view.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { Palette } from '../renderer/src/components/Palette';
import { BoxFilter } from '../renderer/src/components/BoxFilter';
import { NO_FILTER, filterMenu, filterTags } from '../renderer/src/box-filter';

const noop = () => {};
const twenty = Array.from({ length: 20 }, (_, i) => ({ slug: `p${i}`, name: `Project ${i}` }));

const palette = (props) => renderToStaticMarkup(createElement(Palette, new Proxy({
  products: twenty, supervisorPaused: false, look: 'dark', order: [], ...props,
}, { get: (t, k) => (k in t ? t[k] : noop), has: () => true })));

const rows = (html) => [...html.matchAll(/<div class="palette-item[^"]*"><span>([^<]*)<\/span>/g)].map((m) => m[1]);

describe('the palette', () => {
  it('has one Filter line and no row per project', () => {
    const labels = rows(palette({}));
    expect(labels.filter((l) => l === 'Filter…')).toHaveLength(1);
    expect(labels.filter((l) => l.startsWith('Go to '))).toEqual([]);
    expect(labels).not.toContain('All products');
  });

  it('offers Clear filter only while a filter is on', () => {
    expect(rows(palette({ filtering: false }))).not.toContain('Clear filter');
    expect(rows(palette({ filtering: true }))).toContain('Clear filter');
  });
});

describe('the corner', () => {
  const products = [{ slug: 'gilded', name: 'Gilded' }];
  const corner = (filter, open = false) => renderToStaticMarkup(createElement(BoxFilter, {
    filter,
    menu: filterMenu([{ id: 'w-1', product: 'gilded', priority: 9, labels: [] }, { id: 'w-2', product: 'gilded', priority: 5, labels: ['codex-import'] }], filter, products),
    tags: filterTags(filter, products),
    open, onOpen: noop, onClose: noop, onPick: noop, onClear: noop,
  }));

  it('draws the icon and no tag while nothing is on', () => {
    const html = corner(NO_FILTER);
    expect(html).toContain('aria-label="Filter"');
    expect(html).not.toContain('box-filter-tag');
  });

  it('draws a tag per part that is on, in her capitalised words', () => {
    const html = corner({ project: 'gilded', priority: 'urgent', harness: 'codex' });
    const tags = [...html.matchAll(/class="box-filter-tag"[^>]*><span>([^<]*)<\/span>/g)].map((m) => m[1]);
    expect(tags).toEqual(['Gilded', 'Urgent', 'Codex']);
  });

  // The rows of the built menu were not left-aligned. Every row began with an empty
  // 12px tick column, so "Agentbox" sat 37px right of "PROJECT" above it. Nothing
  // may come before a row's name now; the tick for the picked row sits at the end.
  it('starts every row with its name, so names line up under their heading', () => {
    const html = corner({ project: 'gilded', priority: null, harness: null }, true);
    const rows = [...html.matchAll(/<button[^>]*class="when-(?:row|door)[^"]*"[^>]*>(.*?)<\/button>/g)].map((m) => m[1]);
    expect(rows.length).toBeGreaterThan(0);
    for (const inner of rows) expect(inner).toMatch(/^<span class="when-(row|door)-label">/);
    expect(html).toContain('box-filter-tick');
  });

  it('lists the priorities capitalised in the open menu, and both agents when the box holds both', () => {
    const html = corner(NO_FILTER, true);
    const labels = [...html.matchAll(/<span class="when-row-label">([^<]*)<\/span>/g)].map((m) => m[1]);
    expect(labels).toEqual(['Gilded', 'Urgent', 'High', 'Medium', 'Low', 'Claude Code', 'Codex']);
  });
});
