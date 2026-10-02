// THE INBOX MARKS WHAT THE TEAM CAN SEE, AND SHARES A THREAD IN ONE CLICK.
//
// Found on the team build (2026-10-01): a person's threads could all be
// missing from the Team page, and nothing in the inbox said so or offered a
// way to change it. Every thread from before you joined stays yours unless you
// share it (shared/thread-cards.mjs shownToTeam), and a store can hold
// hundreds of them, so the inbox now says it with the least ink that works:
//   - a small people mark after the title of a thread the team can see, and
//     nothing at all on the rest (usually most rows), so the mark means one
//     thing and the list stays quiet;
//   - hovering a row shows Share or Unshare at its right end, in place of
//     when it was updated, and one click writes 'team' or 'private' through
//     threadEdit;
//   - no mark and no button where the question does not arise: nobody signed
//     in, a message between people, an agent's own row, a teammate's thread.
// The approved columns stay exactly Thread, Project, Priority, Updated.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThreadCells, TableHead } from '../renderer/src/threads/Pages.tsx';
import { TeamContext } from '../renderer/src/team/people.tsx';
import { rowSharing, sharePatch } from '../renderer/src/threads/page-rules.ts';
globalThis.React = React;

const NOW = Date.now();
const DAY = 86_400_000;
const SINCE = NOW - 7 * DAY;
const ME = 'p-me';
const northwind = { slug: 'northwind', name: 'Northwind', team: { visibility: 'team', people: [] } };
const direct = { slug: 'direct-1', name: 'Maya', team: { direct: true, people: [ME, 'p-maya'] } };
const row = (o = {}) => ({
  id: 'w-1', product: 'northwind', productName: 'Northwind', status: 'open', title: 'Acme renewal terms', kind: 'directive',
  labels: ['founder'], priority: 5, epoch: 0, claim: null, createdAt: SINCE - DAY, updatedAt: NOW - DAY, createdBy: ME, ...o,
});
const team = { state: { since: SINCE, signedIn: true }, me: ME, byId: new Map(), products: new Map() };
const draw = (item, product = northwind, t = team) => renderToStaticMarkup(
  React.createElement(TeamContext.Provider, { value: t }, React.createElement(ThreadCells, { item, product, now: NOW })),
);
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const css = fs.readFileSync(new URL('../renderer/src/threads/pages.css', import.meta.url), 'utf8');
const pages = fs.readFileSync(new URL('../renderer/src/threads/Pages.tsx', import.meta.url), 'utf8');
const T = { me: ME, since: SINCE };

describe('rowSharing: who sees a row, as the inbox says it', () => {
  it('an old thread nobody shared is yours', () => expect(rowSharing(row(), northwind, T)).toBe('private'));
  it('a thread started after you joined is the team’s', () => expect(rowSharing(row({ createdAt: SINCE + 1 }), northwind, T)).toBe('team'));
  it('the boundary: started the moment you joined is the team’s, a moment before is yours', () => {
    expect(rowSharing(row({ createdAt: SINCE }), northwind, T)).toBe('team');
    expect(rowSharing(row({ createdAt: SINCE - 1 }), northwind, T)).toBe('private');
  });
  it('an old thread shared by hand is the team’s, a new one made private is yours', () => {
    expect(rowSharing(row({ visibility: 'team' }), northwind, T)).toBe('team');
    expect(rowSharing(row({ createdAt: SINCE + 1, visibility: 'private' }), northwind, T)).toBe('private');
  });
  it('asks nothing when nobody is signed in, on a message, on an agent’s row, or on a teammate’s thread', () => {
    expect(rowSharing(row(), northwind, null)).toBeNull();
    expect(rowSharing(row({ product: 'direct-1' }), direct, T)).toBeNull();
    expect(rowSharing(row({ agent: { pid: 1 } }), northwind, T)).toBeNull();
    expect(rowSharing(row({ createdBy: 'p-maya' }), northwind, T)).toBeNull();
    expect(rowSharing(row(), undefined, T)).toBeNull();
  });
  it('a row with no author is yours, as every thread was before teams', () => {
    expect(rowSharing(row({ createdBy: undefined }), northwind, T)).toBe('private');
  });
  it('one click writes the other one', () => {
    expect(sharePatch('private')).toEqual({ visibility: 'team' });
    expect(sharePatch('team')).toEqual({ visibility: 'private' });
  });
});

describe('the row', () => {
  it('marks a thread the team can see with a small people mark after its title, and offers Unshare', () => {
    const html = draw(row({ createdAt: SINCE + DAY }));
    expect(html).toMatch(/th-cell-title[^>]*>Acme renewal terms<svg class="th-shared"/);
    expect(html).toMatch(/<button[^>]*class="th-row-act"[^>]*>.*Unshare<\/button>/);
  });
  // A private thread wears the LOCK here rather than nothing: the mark is
  // unconditional now. Its own rule is pinned in
  // tests/a-private-thread-always-wears-the-lock.test.mjs.
  it('draws the lock on a thread only you can see, and offers Share', () => {
    const html = draw(row());
    expect(html).not.toContain('th-shared');
    expect(html).toContain('th-lock');
    expect(html).toMatch(/<button[^>]*class="th-row-act"[^>]*>.*Share<\/button>/);
    expect(text(html)).not.toContain('Unshare');
  });
  it('draws neither on a message between people', () => {
    const html = draw(row({ product: 'direct-1', body: 'Can you take the call?' }), direct);
    expect(html).not.toContain('th-shared');
    expect(html).not.toContain('th-row-act');
  });
  it('draws neither with nobody signed in', () => {
    const html = draw(row({ createdAt: SINCE + DAY }), northwind, null);
    expect(html).not.toContain('th-shared');
    expect(html).not.toContain('th-row-act');
  });
  it('still says when it was updated, in the same cell the button covers on hover', () => {
    expect(draw(row())).toMatch(/th-cell-when num[^>]*><span class="th-when">1 day ago|th-cell-when num[^>]*><span class="th-when">Yesterday/);
  });
  it('keeps exactly the approved columns', () => {
    expect(text(renderToStaticMarkup(React.createElement(TableHead)))).toBe('Thread Project Priority Updated');
  });
});

describe('the hover', () => {
  it('shows the button only while the row is hovered or the button has focus', () => {
    expect(css).toMatch(/\.th-row-act \{[^}]*opacity: 0/);
    expect(css).toMatch(/\.th-table \.row:hover \.th-row-act, \.th-row-act:focus-visible \{[^}]*opacity: 1/);
  });
  // SQUARE MEANS SQUARE: --radius is 3px in both themes, so every tag in the
  // app was rounded except under the Ember Grid skin. Tags name --tag-radius
  // now, which no skin re-declares.
  it('is square', () => {
    expect(css).toMatch(/\.th-row-act \{[^}]*border-radius: var\(--tag-radius\)/);
  });
  it('does not open the thread underneath', () => {
    expect(pages).toMatch(/className="th-row-act"[\s\S]{0,200}e\.stopPropagation\(\)/);
  });
});
