// A MARK AFTER A TITLE NEVER WRAPS ONTO A LINE BY ITSELF.
//
// Seen on the board (2026-10-02, w-49cace6736): a private card whose title
// just filled its first line ("Send ... R&D tax credit update") put the lock
// alone on a second line. Feedback: "We should never have cases where the icon
// flows over but the text doesn't. In this case update should have flowed over
// with it." The cause: the lock is an inline picture after the title, and a
// browser may break a line right before an inline picture, so the lock wrapped
// and the word before it stayed.
//
// So on a board card the title's last word and the mark sit in one span that
// does not break (`th-keep`, white-space: nowrap): when the mark has to move
// down, the word goes with it. A last word too long to fit a line (a link, say)
// keeps only its last few letters with the mark, and the card lets the rest of
// it break anywhere, so a long word never pushes the card wider. Measured in a
// built page at the screenshot's card width: before, the lock sat on line two
// alone; after, "update" and the lock are on line two together.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InboxBoard } from '../renderer/src/threads/Pages.tsx';
import { TeamContext } from '../renderer/src/team/people.tsx';
globalThis.React = React;

const NOW = Date.now();
const DAY = 86_400_000;
const SINCE = NOW - 7 * DAY;
const ME = 'p-me';
const northwind = { slug: 'northwind', name: 'Northwind', team: { visibility: 'team', people: [] } };
const item = (o = {}) => ({
  id: 'w-1', product: 'northwind', productName: 'Northwind', status: 'open', title: 'Send the R&D tax credit update', kind: 'directive',
  labels: ['founder'], priority: 5, epoch: 0, claim: null, createdAt: SINCE + DAY, updatedAt: NOW - DAY, createdBy: ME, visibility: 'private', ...o,
});
const team = { state: { since: SINCE, signedIn: true }, me: ME, byId: new Map(), products: new Map() };
const display = { view: 'board', sort: 'updated', priorities: [], projects: [], updated: 'any' };
const card = (it) => {
  const html = renderToStaticMarkup(React.createElement(
    TeamContext.Provider, { value: team },
    React.createElement(InboxBoard, { items: [it], products: [northwind], display, now: NOW, onOpenItem: () => {}, picked: [ME] }),
  ));
  return html.match(/<div class="t">([\s\S]*?)<\/div>/)[1];
};
const kept = (t) => t.match(/<span class="th-keep">([\s\S]*?)<\/span>$/)?.[1] ?? null;

describe('the word before the mark moves with it', () => {
  it('the reported card: "update" and the lock are one unbreakable piece', () => {
    const t = card(item());
    expect(t.startsWith('Send the R&amp;D tax credit ')).toBe(true);
    expect(kept(t)).toMatch(/^update<svg class="th-lock"/);
  });
  it('the same for the people mark on a card a few chosen people see', () => {
    expect(kept(card(item({ visibility: 'people', visibleTo: ['p-theo'] })))).toMatch(/^update<svg class="th-shared"/);
  });
  it('a one-word title keeps its whole word with the mark', () => {
    const t = card(item({ title: 'Invoices' }));
    expect(t).toMatch(/^<span class="th-keep">Invoices<svg class="th-lock"/);
  });
  it('trailing spaces do not leave the mark gluing onto nothing', () => {
    expect(kept(card(item({ title: 'Send the update  ' })))).toMatch(/^update<svg/);
  });
  it('a word at the limit (16 letters) still moves whole', () => {
    expect(kept(card(item({ title: 'Read the abcdefghijklmnop' })))).toMatch(/^abcdefghijklmnop<svg/);
  });
  it('a longer word keeps only its last letters with the mark, so the card never widens', () => {
    const t = card(item({ title: 'Read https://example.com/a-very-long-path' }));
    expect(t.startsWith('Read https://example.com/a-very-long-p')).toBe(true);
    expect(kept(t)).toMatch(/^ath<svg class="th-lock"/);
  });
});

describe('what must NOT change', () => {
  it('a card the whole team sees has no mark, so nothing is wrapped', () => {
    const t = card(item({ visibility: 'team' }));
    expect(t).toBe('Send the R&amp;D tax credit update');
  });
});

describe('the look', () => {
  const css = fs.readFileSync(new URL('../renderer/src/threads/pages.css', import.meta.url), 'utf8');
  it('the kept piece does not break', () => {
    expect(css).toMatch(/\.th-keep \{[^}]*white-space: nowrap/);
  });
  it('a card title may break a long word anywhere, so the kept piece never overflows', () => {
    expect(css).toMatch(/\.th-card \.t \{[^}]*overflow-wrap: anywhere/);
  });
});
