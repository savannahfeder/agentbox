// THE SUMMARY READS ITS NAME AND LINES FIRST, AND KEEPS ITS PROPERTIES AT THE FOOT
// (w-922f66bb06).
//
// What she asked, 2026-10-02: "I need to see the title, the problem, and the
// solution far more frequently than I ever look at the status, owner, and all
// those other things." The panel opened with five rows of properties and a
// hairline before the thread's name. Counted on her screenshot: the name sat
// under five property rows, and Problem started 410 points down a 1960 point
// panel.
//
// Picked from full-screen drawings (design A): the name, Problem, Progress and
// Solution at the top; the hairline and the properties pinned to the foot of
// the panel. Priority moved up to second. "Kept up to date by the agent · 6
// min ago" left the words and became the last property, Updated, and only the
// time: she found "By the agent · 6 min ago" ugly and the lowercase "just now"
// weird, so it reads "Just now", "6 min ago".
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SummaryPanel } from '../renderer/src/threads/Summary.tsx';
import { updatedWord } from '../renderer/src/threads/summary-rules.ts';
globalThis.React = React;

const NOW = Date.now();
const M = 60_000;
const item = (o = {}) => ({
  id: 'w-acme', product: 'northwind', productName: 'Northwind', status: 'open', kind: 'directive', labels: ['founder'],
  title: 'Can you send Acme their renewal terms?', label: 'Acme renewal terms', priority: 7, epoch: 0, claim: null,
  createdAt: NOW - 60 * M, updatedAt: NOW - 6 * M,
  problem: 'Acme’s contract ends on the 14th.', progress: 'Terms are drafted.',
  wrote: { problem: { ts: NOW - 6 * M, source: 'agent', by: 'p-sam' } },
  ...o,
});
const draw = (it) => renderToStaticMarkup(React.createElement(SummaryPanel, { item: it, team: null }));
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const css = fs.readFileSync(new URL('../renderer/src/threads/summary.css', import.meta.url), 'utf8');
const rule = (sel) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`));
  return m ? m[1] : '';
};

describe('the order', () => {
  const words = text(draw(item()));
  // An empty line is not drawn at all since w-54e9c7243f, so the order is
  // read off a thread with all three written.
  // CHANGED 2026-10-05 (w-54e9c7243f): the words are Context then Done.
  it('opens with the name, then Context and Done', () => {
    expect(text(draw(item({ solution: 'Terms sent.' })))).toMatch(/^Acme renewal terms Context Acme’s contract ends on the 14th\. Done Terms are drafted\. Status/);
  });
  it('ends with the properties, Priority second and Updated last', () => {
    expect(words).toMatch(/Status In progress Priority High Owner You Project Northwind Visible to Team Updated 6 min ago$/);
  });
  it('puts the hairline between the words and the properties, inside the foot', () => {
    expect(draw(item())).toMatch(/<div class="ts-foot"><div class="ts-rule"><\/div><div class="ts-props">/);
  });
});

describe('the foot stays at the bottom of the panel', () => {
  it('is pushed down by the space above it', () => {
    expect(rule('.ts-panel')).toMatch(/display: flex/);
    expect(rule('.ts-panel')).toMatch(/flex-direction: column/);
    expect(rule('.ts-foot')).toMatch(/margin-top: auto/);
  });
  it('opens its menus upward, since the rows sit at the bottom of the window', () => {
    const menu = rule('.ts-panel .prio-menu.ts-menu');
    expect(menu).toMatch(/bottom: calc\(100% \+ 6px\)/);
    expect(menu).toMatch(/top: auto/);
  });
});

describe('Updated says only when', () => {
  it('reads "6 min ago", with no "by the agent" and no "Kept up to date"', () => {
    const words = text(draw(item()));
    expect(words).toContain('Updated 6 min ago');
    expect(words).not.toMatch(/Kept up to date|by the agent|Edited by/);
  });
  it('starts with a capital: "Just now", never "just now"', () => {
    expect(updatedWord(item({ wrote: { progress: { ts: NOW - 5_000, source: 'agent' } } }), { me: null, now: NOW })).toBe('Just now');
    expect(text(draw(item({ wrote: { progress: { ts: Date.now() - 5_000, source: 'agent' } } })))).toContain('Updated Just now');
  });
  it('takes the latest write of the three lines, by anyone', () => {
    const it2 = item({ wrote: { problem: { ts: NOW - 50 * M, source: 'agent' }, solution: { ts: NOW - 3 * M, source: 'founder', by: 'p-sam' } } });
    expect(updatedWord(it2, { me: 'p-sam', now: NOW })).toBe('3 min ago');
  });
  it('counts an edit of yours not yet back from the store', () => {
    expect(updatedWord(item(), { me: 'p-sam', now: NOW, pending: { progress: NOW - 1_000 } })).toBe('Just now');
  });
  it('ignores the title and the ask, which are not the summary', () => {
    expect(updatedWord(item({ wrote: { title: { ts: NOW, source: 'founder' } } }), { me: null, now: NOW })).toBeNull();
  });
  it('draws no Updated row when the summary has never been written', () => {
    expect(text(draw(item({ wrote: {} })))).not.toContain('Updated');
  });
});
