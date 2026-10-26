// MY WORKSPACE SAYS WHAT IT IS, ON THE ROW A NEW USER MEETS IT ON.
//
// A tester finished the setup on 2026-10-25, named their own project
// "Sandbox 1", opened ⌘K and found three rows: Rank My Workspace first, Rank
// Sandbox 1 first, Rank Practice first. They had made two of those three.
//
// My Workspace is not a bug. The app makes it at launch so that a thread
// always has somewhere to go (main/main.mjs, approved 2026-10-05), and taking
// it away puts back the dead Send button that decision was made to fix. What
// was missing is a word about it anywhere a new person meets it, so its row
// says what it is until it has a place in the order, which is the point where
// where it stands becomes the more useful thing to say.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Palette } from '../renderer/src/components/Palette';

const noop = () => {};
/** A fresh machine the day after setup: the project they named, the practice
 *  one, and the workspace the app made for them. */
const PRODUCTS = [
  { slug: 'my-workspace', name: 'My Workspace', personal: true },
  { slug: 'sandbox-1', name: 'Sandbox 1' },
];

const palette = (props) => renderToStaticMarkup(createElement(Palette, new Proxy({
  products: PRODUCTS, supervisorPaused: false, look: 'dark', order: [], ...props,
}, { get: (t, k) => (k in t ? t[k] : noop), has: () => true })));

/** Each row as [label, hint]. */
const rows = (html) => [...html.matchAll(
  /<span class="palette-label">([^<]*)<\/span>(?:<span class="palette-hint">([^<]*)<\/span>)?/g,
)].map((m) => [m[1], m[2] ?? '']);
const hintOf = (html, label) => (rows(html).find(([l]) => l === label) ?? [])[1];

describe('the row for the project nobody made', () => {
  it('says what it is for while it has no place in the order', () => {
    expect(hintOf(palette({}), 'Rank My Workspace first'))
      .toBe('made for you, so a thread always has somewhere to go');
  });

  // The case that must NOT match: a project they made themselves says nothing
  // of the kind, because they know where it came from.
  it('says nothing of the kind on a project they made', () => {
    expect(hintOf(palette({}), 'Rank Sandbox 1 first')).toBe('not ranked yet');
  });

  // And the boundary the other side of "not ranked yet": once it is in the
  // order, where it stands is what the hint is for.
  it('gives the order back once it has one', () => {
    const html = palette({ order: ['my-workspace', 'sandbox-1'] });
    expect(hintOf(html, 'Rank My Workspace first')).toBe('now #1 of 2');
  });

  // One line, like every other row in the list
  // (tests/a-palette-row-never-stacks-onto-two-lines).
  it('is no longer than the hints beside it', () => {
    const longest = Math.max(...rows(palette({})).map(([, hint]) => hint.length));
    expect(hintOf(palette({}), 'Rank My Workspace first').length).toBeLessThanOrEqual(longest);
    expect(longest).toBeLessThanOrEqual(63);
  });
});
