// THE SUMMARY NAMES ITS THREAD, SHOWS WHAT YOU CAN CHANGE, AND SAYS WHO
// REALLY SEES IT.
//
// Three things the founder reported on the first build of the panel
// (w-e731ca9376, 2026-10-01), each pinned here:
//   - Looking at the panel alone, she could not tell which thread it was
//     about. It now opens with the thread's name, the same one the inbox row
//     shows (rowTitle: the label before the title).
//   - She had to try hard to click Urgent before she noticed it changed
//     anything: the only hint was a dotted underline on hover. Every field she
//     can change now answers the pointer with a wash, a pointer cursor and a
//     small caret or pencil; the ones she cannot change (Status, Owner,
//     Project) carry none of it, so the difference reads at a glance.
//     Project stays read-only on purpose: nothing in the store moves a thread
//     from one project's ledger to another, and a menu here would have to
//     invent that.
//   - None of her hundreds of threads from before she joined is on the Team
//     page (shared/thread-cards.mjs shownToTeam), but the panel still said
//     "Team" on every one of them, because it read the word on disk rather
//     than the rule. It says "Only you" now, and changing it writes 'team' or
//     'private' through the same threadEdit path as every other field.
// Drawn with react-dom/server, so these are the real components.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SummaryPanel } from '../renderer/src/threads/Summary.tsx';
import { whoSees, VISIBILITY_WORD } from '../renderer/src/threads/summary-rules.ts';
globalThis.React = React;

const NOW = Date.now();
const DAY = 86_400_000;
const SINCE = NOW - 7 * DAY; // she joined the team a week ago
const item = (o = {}) => ({
  id: 'w-acme', product: 'northwind', productName: 'Northwind', status: 'open', kind: 'directive', labels: ['founder'],
  title: 'Can you send Acme their renewal terms by Thursday? Their contract ends on the 14th.',
  label: 'Acme renewal terms', priority: 7, epoch: 0, claim: null, createdAt: NOW - DAY, updatedAt: NOW - DAY, ...o,
});
const team = { state: { since: SINCE, signedIn: true }, me: 'p-me', byId: new Map(), products: new Map() };
const draw = (it, t = team) => renderToStaticMarkup(React.createElement(SummaryPanel, { item: it, items: [it], team: t }));
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const between = (html, a, b) => html.slice(html.indexOf(`>${a}<`), html.indexOf(`>${b}<`));
const css = fs.readFileSync(new URL('../renderer/src/threads/summary.css', import.meta.url), 'utf8');
const src = fs.readFileSync(new URL('../renderer/src/threads/Summary.tsx', import.meta.url), 'utf8');

describe('the panel opens with the thread’s name', () => {
  it('says the name the row shows, the label, before anything else', () => {
    const html = draw(item());
    expect(html).toMatch(/^<aside[^>]*><h2 class="ts-title">Acme renewal terms<\/h2>/);
    expect(text(html)).toMatch(/^Acme renewal terms Status In progress Owner You Project Northwind/);
  });
  it('falls back to the title on a thread with no label', () => {
    expect(draw(item({ label: undefined }))).toContain('<h2 class="ts-title">Can you send Acme their renewal terms by Thursday? Their contract ends on the 14th.</h2>');
  });
  it('treats a blank label as no label, the way the row does', () => {
    expect(draw(item({ label: '   ', title: 'Pricing page' }))).toContain('<h2 class="ts-title">Pricing page</h2>');
  });
});

describe('what you can change looks changeable, and what you cannot does not', () => {
  const html = draw(item());
  it('draws Priority and Visible to as buttons that carry a caret', () => {
    for (const [from, to] of [['Priority', 'Visible to'], ['Visible to', 'Linked']]) {
      const cell = between(html, from, to);
      expect(cell).toMatch(/<button[^>]*class="ts-prop-btn"/);
      expect(cell).toContain('ts-caret');
    }
  });
  // AND STATUS JOINED THEM ON 2026-10-01: a thread can be marked done from a
  // dropdown on its Status row. It is a
  // button only where there is something to set and somebody to set it with,
  // which is what `onFinish` is; this file draws the panel without that prop,
  // so Status is a plain word here and stays below with Owner and Project.
  // The dropdown itself is tests/the-status-row-marks-a-thread-done.test.mjs.
  it('draws Owner and Project as plain words: no button, no caret', () => {
    for (const [from, to] of [['Owner', 'Project'], ['Project', 'Priority']]) {
      const cell = between(html, from, to);
      expect(cell.length).toBeGreaterThan(0);
      expect(cell).not.toContain('<button');
      expect(cell).not.toContain('ts-caret');
    }
  });
  it('leaves Status a plain word when nothing is handed in to close the thread', () => {
    const cell = between(html, 'Status', 'Owner');
    expect(cell.length).toBeGreaterThan(0);
    expect(cell).not.toContain('<button');
    expect(cell).not.toContain('ts-caret');
  });
  it('puts a pencil on each of the three lines', () => {
    expect(html.match(/class="ts-line[^"]*"[^>]*>.*?ts-pen/g)).toHaveLength(3);
  });
  it('answers the pointer on a changeable field with the wash, a pointer and its mark', () => {
    expect(css).toMatch(/\.ts-prop-btn \{[^}]*cursor: pointer/);
    expect(css).toMatch(/\.ts-prop-btn:hover[^{]*\{[^}]*background: var\(--wash\)/);
    expect(css).toMatch(/\.ts-line:hover \{[^}]*background: var\(--wash\)/);
    expect(css).toMatch(/\.ts-line \{[^}]*cursor: pointer/);
    expect(css).toMatch(/\.ts-caret, \.ts-pen \{[^}]*opacity: 0/);
    expect(css).toMatch(/\.ts-prop-btn:hover \.ts-caret/);
    expect(css).toMatch(/\.ts-line:hover \.ts-pen/);
  });
  it('gives a read-only value no hover at all', () => {
    expect(css).not.toMatch(/\.ts-value:hover/);
    expect(css).not.toMatch(/\.ts-title:hover/);
  });
  it('keeps the old dotted underline off the changeable fields', () => {
    expect(css).not.toMatch(/\.ts-prop-btn:hover \{[^}]*text-decoration/);
  });
});

describe('Visible to says who really sees it', () => {
  it('reads Only you on a thread from before you joined that nobody shared', () => {
    expect(text(draw(item({ createdAt: SINCE - DAY })))).toMatch(/Visible to Only you/);
  });
  it('reads Team on a thread started after you joined', () => {
    expect(text(draw(item({ createdAt: SINCE + DAY })))).toMatch(/Visible to Team/);
  });
  it('reads Team on an old thread you shared by hand', () => {
    expect(text(draw(item({ createdAt: SINCE - DAY, visibility: 'team' })))).toMatch(/Visible to Team/);
  });
  it('reads Only you on a new thread you made private', () => {
    expect(text(draw(item({ createdAt: SINCE + DAY, visibility: 'private' })))).toMatch(/Visible to Only you/);
  });
  it('the boundary: a thread started the moment you joined is the team’s', () => {
    expect(whoSees(item({ createdAt: SINCE }), SINCE)).toBe('team');
    expect(whoSees(item({ createdAt: SINCE - 1 }), SINCE)).toBe('private');
  });
  it('keeps the old rule with nobody signed in', () => {
    expect(whoSees(item({ createdAt: 5 }), null)).toBe('team');
    // Three words since w-41ff964775: the team, a few people, or nobody.
    expect(VISIBILITY_WORD).toEqual({ team: 'Team', people: 'Chosen people', private: 'Only you' });
  });
  it('writes the choice through threadEdit as team or private, from a menu that shows both', () => {
    expect(src).toMatch(/menu === 'visibility' &&/);
    expect(src).toMatch(/void save\(\{ visibility: v \}\)/);
  });
  it('uses no em dash anywhere', () => {
    expect(draw(item())).not.toContain('—');
  });
});
