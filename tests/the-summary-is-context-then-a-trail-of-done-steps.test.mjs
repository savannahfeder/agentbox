// THE SUMMARY IS CONTEXT, THEN A TRAIL OF DONE STEPS (w-54e9c7243f, 2026-10-05).
//
// What changed: the panel drew Problem, Progress and Solution, one sentence
// each. Picked over seven rounds of full-window pictures: Context, a few
// sentences that bring the thread back to mind, then Done, the steps taken so
// far as a timeline of dots joined by a thin line, newest last ("defo the
// timeline view"). Solution is no longer drawn. Spacing as approved on the
// same thread: 22px under the name, the label close over its words, 18px
// between the two parts. Measured by drawing the real panel with
// react-dom/server and reading its stylesheet.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SummaryPanel, TeammateCard } from '../renderer/src/threads/Summary.tsx';
globalThis.React = React;

const NOW = Date.now();
const item = (o = {}) => ({
  id: 'w-zoom', product: 'kestrel', productName: 'Kestrel', status: 'open', title: 'Card zoom flickers on Safari', kind: 'directive',
  labels: [], priority: 2, epoch: 0, claim: null, createdAt: NOW - 3_600_000, updatedAt: NOW - 60_000,
  problem: 'Cards flicker in Safari when you hover to zoom. Chrome is fine.',
  progress: 'Found it: the zoom is applied twice\nTilt code no longer moves the card\nTests pass',
  solution: 'Ship the fix.',
  ...o,
});
const draw = (o) => renderToStaticMarkup(React.createElement(SummaryPanel, { item: item(o), team: null }));
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const css = fs.readFileSync(new URL('../renderer/src/threads/summary.css', import.meta.url), 'utf8');
const rule = (sel) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`));
  return m ? m[1] : '';
};

describe('the two parts', () => {
  it('reads the name, Context, then Done with each step in the order written', () => {
    expect(text(draw())).toMatch(/^Card zoom flickers on Safari Context Cards flicker in Safari when you hover to zoom\. Chrome is fine\. Done Found it: the zoom is applied twice Tilt code no longer moves the card Tests pass Status/);
  });
  it('draws each step as its own item in one trail, the newest marked as the last', () => {
    const html = draw();
    expect(html.match(/<li class="ts-step[^"]*"/g)).toHaveLength(3);
    expect(html).toMatch(/<li class="ts-step ts-step-last">Tests pass<\/li>/);
    expect(html).toMatch(/<ol class="ts-trail">/);
  });
  it('no longer draws Problem, Progress or Solution, nor the solution’s words', () => {
    const w = text(draw());
    expect(w).not.toMatch(/\bProblem\b|\bProgress\b|\bSolution\b/);
    expect(w).not.toContain('Ship the fix.');
  });
  it('draws an older one-sentence progress as a single step', () => {
    const html = draw({ progress: 'Terms are drafted at 8% over last year.' });
    expect(html.match(/<li class="ts-step[^"]*"/g)).toHaveLength(1);
    expect(text(html)).toMatch(/Done Terms are drafted at 8% over last year\./);
  });
  it('leaves Done out entirely when nothing is done yet', () => {
    const w = text(draw({ progress: '' }));
    expect(w).not.toMatch(/\bDone\b/);
    expect(w).toMatch(/Context Cards flicker/);
  });
  it('strips the marks a writer puts in front of a step', () => {
    expect(draw({ progress: '- Found it\n✓ Fixed it' })).toMatch(/>Found it<\/li><li class="ts-step ts-step-last">Fixed it</);
  });
});

describe('a teammate’s card', () => {
  const card = (o = {}) => ({
    personId: 'p', threadId: 't', visible: true, title: 'T', project: 'Kestrel', state: 'running', priority: 2,
    problem: 'Cards flicker in Safari when you hover to zoom.', progress: 'Found it\nTests pass', solution: 'Ship the fix.',
    blockedBy: [], blocks: [], updatedAt: NOW, ...o,
  });
  const drawCard = (o) => renderToStaticMarkup(React.createElement(TeammateCard, { card: card(o), person: null }));
  it('leads with the Context, then the same Done trail', () => {
    const html = drawCard();
    expect(text(html)).toMatch(/Cards flicker in Safari when you hover to zoom\. Done Found it Tests pass Blocked by/);
    expect(html).toMatch(/<li class="ts-step ts-step-last">Tests pass<\/li>/);
  });
  it('draws no Problem, Solution or solution words', () => {
    const w = text(drawCard());
    expect(w).not.toMatch(/\bProblem\b|\bSolution\b/);
    expect(w).not.toContain('Ship the fix.');
  });
  it('leaves Done off when nothing is done', () => {
    expect(text(drawCard({ progress: null }))).not.toMatch(/\bDone\b/);
  });
});

describe('the spacing and the trail', () => {
  it('leaves 22px under the name', () => {
    expect(rule('.ts-title')).toMatch(/margin: 0 0 22px/);
  });
  it('keeps a label close over its words, and 12px between parts', () => {
    expect(rule('.ts-h')).toMatch(/margin: 0 0 2px/);
    expect(rule('.ts-sec')).toMatch(/margin: 0 0 12px/);
  });
  it('draws Done smaller and dimmer than Context', () => {
    expect(rule('.ts-trail')).toMatch(/font-size: 12\.5px/);
    expect(rule('.ts-trail')).toMatch(/color: var\(--text-dim\)/);
  });
  it('puts a dot on every step and a line between them, not after the last', () => {
    expect(rule('.ts-step::before')).toMatch(/border-radius: 50%/);
    expect(rule('.ts-step:not(:last-child)::after')).toMatch(/width: 1px/);
  });
});
