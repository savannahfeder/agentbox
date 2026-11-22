// THE SUMMARY IS CONTEXT, THEN A TRAIL OF DONE STEPS (w-54e9c7243f, 2026-10-05).
//
// What changed: the panel drew Problem, Progress and Solution, one sentence
// each. Picked over seven rounds of full-window pictures: Context, a few
// sentences that bring the thread back to mind, then Done, the steps taken so
// far as a timeline of dots joined by a thin line, newest last ("defo the
// timeline view"). Solution is no longer drawn. The side panel this was drawn
// for went in 2026-11 (w-d143fcb40a); a teammate's thread's summary, at the top
// of its page since w-8a8eac7620, still reads this way, with Done named for
// what it is there: what their agent already tried.
// Measured by drawing the real summary with react-dom/server.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TeammateSummary } from '../renderer/src/threads/Summary.tsx';
globalThis.React = React;

const NOW = Date.now();
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const css = fs.readFileSync(new URL('../renderer/src/threads/summary.css', import.meta.url), 'utf8');
const rule = (sel) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`));
  return m ? m[1] : '';
};

describe('a teammate’s card', () => {
  const card = (o = {}) => ({
    personId: 'p', threadId: 't', visible: true, title: 'T', project: 'Kestrel', state: 'running', priority: 2,
    problem: 'Cards flicker in Safari when you hover to zoom.', progress: 'Found it\nTests pass', solution: 'Ship the fix.',
    blockedBy: [], blocks: [], updatedAt: NOW, ...o,
  });
  const drawCard = (o) => renderToStaticMarkup(React.createElement(TeammateSummary, { card: card(o), owner: 'Lena' }));
  it('leads with the Context, then the same Done trail', () => {
    const html = drawCard();
    expect(text(html)).toBe('Cards flicker in Safari when you hover to zoom. What Lena&#x27;s agent already tried Found it Tests pass');
    expect(html).toMatch(/<li class="ts-step ts-step-last">Tests pass<\/li>/);
  });
  it('draws no Problem, Solution or solution words', () => {
    const w = text(drawCard());
    expect(w).not.toMatch(/\bProblem\b|\bSolution\b/);
    expect(w).not.toContain('Ship the fix.');
  });
  it('leaves the trail off when nothing is done', () => {
    expect(text(drawCard({ progress: null }))).not.toMatch(/already tried/);
  });
});

describe('the spacing and the trail', () => {
  it('keeps a label close over its words', () => {
    expect(rule('.ts-h')).toMatch(/margin: 0 0 2px/);
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
