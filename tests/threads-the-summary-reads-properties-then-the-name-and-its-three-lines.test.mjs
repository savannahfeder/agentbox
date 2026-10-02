// THE SUMMARY READS AS TWO PARTS: THE PROPERTIES, THEN THE NAME AND ITS THREE
// LINES TOGETHER.
//
// Reported 2026-10-01 (w-b38e975e2c) on the approved panel. She reads it as
// the name, the problem, the progress and the solution, in that order, and
// skips the properties. But the name sat at the top and the three lines sat at
// the bottom, with nine rows of properties and links between them (Status,
// Owner, Project, Priority, Visible to, a "Linked" heading, Blocked by, Blocks),
// so her eye jumped a block of rows it does not read to get from the name to
// the problem. Counted on her screenshot: the name and "Problem" were eight
// rows and a hairline apart.
//
// Now the properties come first, a hairline, then the name directly above
// Problem, Progress and Solution. "Blocked by" and "Blocks" are gone from the
// panel: she asked for them out. The row still carries blockedBy and blocks,
// and a teammate's card still shows them; only this panel stopped drawing them.
// Drawn with react-dom/server, so these are the real components.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SummaryPanel, TeammateCard } from '../renderer/src/threads/Summary.tsx';
globalThis.React = React;

const NOW = Date.now();
const M = 60_000;
const item = (o = {}) => ({
  id: 'w-acme', product: 'northwind', productName: 'Northwind', status: 'open', kind: 'directive', labels: ['founder'],
  title: 'Can you send Acme their renewal terms?', label: 'Acme renewal terms', priority: 7, epoch: 0, claim: null,
  createdAt: NOW - 60 * M, updatedAt: NOW - 19 * M,
  problem: 'Acme’s contract ends on the 14th.', progress: 'Terms are drafted.',
  blockedBy: ['w-google'], blocks: ['w-hidden'],
  ...o,
});
const items = [item(), item({ id: 'w-google', label: 'Sign in with Google' })];
const draw = (it) => renderToStaticMarkup(React.createElement(SummaryPanel, { item: it, items, team: null }));
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const src = fs.readFileSync(new URL('../renderer/src/threads/Summary.tsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../renderer/src/threads/summary.css', import.meta.url), 'utf8');

describe('the panel reads properties first, then the name and its three lines', () => {
  const html = draw(item());
  it('opens with the properties, and the name comes after them', () => {
    expect(text(html)).toMatch(/^Status In progress Owner You Project Northwind Priority High Visible to Team Acme renewal terms Problem/);
  });
  it('puts the name directly above Problem, after the hairline, with nothing between', () => {
    expect(html).toMatch(/<div class="ts-rule"><\/div><h2 class="ts-title">Acme renewal terms<\/h2><div class="ts-sec"><div class="ts-h">Problem<\/div>/);
  });
  it('keeps problem, progress and solution in that order under the name', () => {
    expect(text(html)).toMatch(/Acme renewal terms Problem Acme’s contract ends on the 14th\. Progress Terms are drafted\. Solution Not written yet/);
  });
  it('draws the name once', () => {
    expect(html.match(/class="ts-title"/g)).toHaveLength(1);
  });
  // Her pick after three rounds of full-window shots (light Geist at 16 to
  // 24px, and six other styles): 16px light. Not 24 light, which she liked
  // and found too big, and not the 16px medium it started as.
  //
  // Then 2026-10-02 (w-5391bb330f): light read too thin against the lines
  // under it, and she asked for one or two weights up. Shown full-window in
  // Dark at 300, 400, 500 and 600, she picked 500. Still 16px: only the
  // weight moved.
  it('sets the name in Geist medium at 16px', () => {
    const rule = css.match(/\.ts-title \{[^}]*\}/)[0];
    expect(rule).toMatch(/font-size: 16px/);
    expect(rule).toMatch(/font-weight: 500/);
    expect(rule).not.toMatch(/font-weight: (300|400|600)/);
    expect(rule).not.toMatch(/font-family/);
  });
});

describe('Blocked by and Blocks are gone from the panel', () => {
  it('draws no Linked heading, no Blocked by, no Blocks, even on a thread that has links', () => {
    const words = text(draw(item()));
    expect(words).not.toMatch(/Linked|Blocked by|Blocks/);
    expect(words).not.toContain('Sign in with Google');
    expect(words).not.toContain('A thread you cannot see');
  });
  it('draws none of it on a thread with no links either', () => {
    expect(text(draw(item({ blockedBy: undefined, blocks: undefined })))).not.toMatch(/Linked|Blocked by|Blocks|None/);
  });
  it('has no code left that would draw or write a link from the panel', () => {
    const panel = src.slice(src.indexOf('export function SummaryPanel'), src.indexOf('a teammate\'s */'));
    expect(panel).not.toMatch(/blockedBy|'blocks'|linkRow|ts-link/);
  });
  it('must not touch a teammate’s card, which still says what blocks it', () => {
    const card = text(renderToStaticMarkup(React.createElement(TeammateCard, {
      card: { personId: 'p', threadId: 't', visible: true, title: 'T', project: 'P', state: 'running', priority: 7, problem: null, progress: null, solution: null,
        blockedBy: [{ id: 'w-google', title: 'Sign in with Google' }], blocks: [], updatedAt: NOW },
      person: null,
    })));
    expect(card).toMatch(/Blocked by Sign in with Google Blocks Nothing/);
  });
});
