// THE SUMMARY FOLDS TO A RAIL, AND THE HEADER STOPS SAYING "WAITING" (w-a3482b8c2c).
//
// What was wrong: the Summary button in the corner drew more attention than
// anything else in the thread, and since the summary is open by default its
// open state, a grey wash, read as a hover that never ended. Two design rounds
// later the pick was the rail: closed, the summary folds to a 48 point strip on
// the right holding the thread's marks (state, priority, owner, who sees it),
// and the whole strip opens it again. Open, it closes from a small icon beside
// its own title. The corner keeps only the thread's menu.
//
// And the state was said twice. The line under the title led with
// "● WAITING", which the rail (closed) and the panel's Status row (open)
// already say. So the line only carries the mark when neither of them is on
// screen, which is while a document fills the thread.
//
// Measured before the change: SummaryToggle was portalled into the corner on
// every summarised thread, and the byline was handed ThreadStateMark whether
// or not the panel showed the same word.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as Summary from '../renderer/src/threads/Summary.tsx';
import { Byline } from '../renderer/src/components/Byline.tsx';
globalThis.React = React;

const { SummaryRail, SummaryPanel } = Summary;
const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../renderer/src/threads/summary.css', import.meta.url), 'utf8');

const NOW = Date.now();
const M = 60_000;
const item = (o = {}) => ({
  id: 'w-acme', product: 'northwind', productName: 'Northwind', status: 'open', title: 'Acme renewal terms', kind: 'review',
  labels: [], priority: 5, epoch: 0, claim: null, createdAt: NOW - 60 * M, updatedAt: NOW - 19 * M, createdBy: 'p-sam',
  result: 'Send these terms?', ...o,
});
const sam = { id: 'p-sam', name: 'Sam Rivera', email: 'sam@example.test', avatarUrl: null };
const team = { me: 'p-sam', byId: new Map([['p-sam', sam]]), state: { since: null, people: [sam] }, products: new Map() };
const draw = (el) => renderToStaticMarkup(el);
const rail = (o = {}, t = team) => draw(React.createElement(SummaryRail, { item: item(o), team: t, onOpen: () => {} }));

describe('the rail, while the summary is closed', () => {
  it('is one button that opens the summary and says S on its hover plate', () => {
    const html = rail();
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain('class="ts-rail"');
    expect(html).toContain('data-hint="summary"');
    expect(html).toContain('aria-label="Show the summary"');
  });
  // THE PLATE HUNG OVER THE CORNER MENU. A plate is placed off the box of the
  // element wearing the hint, and the rail is the whole height of the pane, so
  // there was no room under it and the plate rose above it, across the three
  // dots (photographed in the built renderer, 2026-10-02). It hangs from the
  // rail's icon instead, the one mark that is about opening.
  it('hangs its hover plate from its icon, not from the whole strip', () => {
    const html = rail();
    expect(html).toMatch(/<span class="ts-rail-ic" data-hint="summary" data-hint-align="right">/);
    expect(html).not.toMatch(/<button[^>]*data-hint=/);
  });
  it('carries the state mark the panel would show: filled while it waits on you', () => {
    expect(rail()).toContain('ts-st-need');
    expect(rail({ status: 'claimed', claim: { holder: 'h', leaseUntil: NOW + 5 * M } })).toContain('ts-st-run');
    expect(rail({ status: 'done' })).toContain('ts-st-done');
  });
  it('names the state on its mark, so the word is one hover away', () => {
    expect(rail()).toContain('title="Waiting"');
  });
  it('carries the priority as the app’s own bars', () => {
    expect(rail()).toContain('prio-bars');
    expect(rail({ priority: 9 })).toContain('prio-bars p4');
  });
  it('shows the owner’s face and who sees it on a team', () => {
    const html = rail();
    expect(html).toContain('tm-av');
    expect(html).toContain('title="Owner: You"');
    expect(html).toMatch(/title="Visible to [^"]+"/);
  });
  it('but draws neither without a team, where there is nobody else to name', () => {
    const html = rail({}, null);
    expect(html).not.toContain('tm-av');
    expect(html).not.toContain('Visible to');
    expect(html).toContain('ts-st-need');
  });
});

describe('the panel, while the summary is open', () => {
  const panel = (onClose) => draw(React.createElement(SummaryPanel, { item: item(), items: [item()], team, onClose }));
  it('closes from one small icon beside its title', () => {
    const html = panel(() => {});
    expect(html).toContain('class="ts-close"');
    expect(html).toContain('title="Hide the summary"');
    expect(html.indexOf('ts-close')).toBeLessThan(html.indexOf('ts-props'));
  });
  it('and draws no such icon when nothing can close it', () => {
    expect(panel(undefined)).not.toContain('ts-close');
  });
});

describe('the thread page', () => {
  it('keeps only the thread’s menu in the corner: no Summary button there any more', () => {
    const portal = focus.slice(focus.indexOf('createPortal(<span className="ts-top">'));
    expect(portal.slice(0, portal.indexOf('cornerHeaderTarget)'))).not.toContain('Summary');
    expect(Summary.SummaryToggle).toBeUndefined();
  });
  it('draws the rail exactly when the summary is offered and closed', () => {
    expect(focus).toMatch(/summaryOffered && !summaryOpen && <SummaryRail /);
    expect(focus).toContain("data-summary={summaryShown ? 'open' : summaryOffered ? 'rail' : undefined}");
  });
  it('says the state under the title only when neither the panel nor the rail is there to say it', () => {
    expect(focus).toContain('lead={summarised && !summaryOffered ? <ThreadStateMark item={item} /> : null}');
    expect(focus).toContain('stateShown={summarised && summaryOffered}');
  });
});

// THE STATE IN OTHER WORDS IS STILL THE STATE. The first build took the mark
// off and the line fell back to its unled form, which reads "IN YOUR INBOX"
// on a waiting thread and "WORKING" on a running one: the state again.
// Photographed in the built renderer, 2026-10-02: "NORTHWIND · IN YOUR INBOX ·
// LAST MOVED 40M AGO". So the line is told the state is on screen elsewhere
// and drops those words exactly as it does when it is led by the mark.
describe('the line under the title, while the summary says the state', () => {
  const thread = item({ kind: 'directive', labels: ['founder'], updatedAt: NOW - 52 * M, wrote: { body: { ts: NOW - 52 * M, source: 'founder' } } });
  const running = { ...thread, status: 'claimed', claim: { holder: 'h', leaseUntil: NOW + 5 * M } };
  const session = { itemId: 'w-acme', product: 'northwind', startedAt: NOW - 75_000, tail: [] };
  const line = (el) => draw(el).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  it('does not say "In your inbox" on a waiting thread, and keeps the project and the clock', () => {
    const html = draw(React.createElement(Byline, { item: thread, facts: {}, stateShown: true }));
    expect(line(React.createElement(Byline, { item: thread, facts: {}, stateShown: true }))).toBe('Northwind · last moved 52m ago');
    expect(html).not.toContain('ts-st');
  });
  it('does not say "Working" or "In progress" on a running one, and keeps the run time and the engine', () => {
    const text = line(React.createElement(Byline, { item: running, facts: { session, inProgress: true, engineChoice: true }, stateShown: true }));
    expect(text).toBe('1m Northwind · Claude Code');
  });
  it('keeps Blocked, which the rail’s mark does not say', () => {
    expect(line(React.createElement(Byline, { item: { ...thread, status: 'blocked' }, facts: {}, stateShown: true }))).toContain('Blocked');
  });
  it('and a line that is not told keeps every word it had', () => {
    expect(line(React.createElement(Byline, { item: thread, facts: {} }))).toBe('Northwind · In your inbox · last moved 52m ago');
  });
  it('puts a dot between the run time and the project now that no word stands before it', () => {
    expect(css).toMatch(/\.by-lead \.live-span ~ \.fm-said::before \{ content: '· '; \}/);
  });
});

describe('the rail’s room', () => {
  it('is 48 points, and the conversation, the reply box, the band and the terminal all give it up', () => {
    expect(css).toMatch(/--ts-rail-w: 48px/);
    for (const part of ['.focus-scroll', '.focus-dock', '.keep-line', '.task-terminal']) {
      expect(css).toContain(`.focus-pane[data-summary="rail"] > ${part}`);
    }
  });
  it('answers the pointer with the light wash, and has no pressed state to mistake for a hover', () => {
    expect(css).toMatch(/\.ts-rail:hover[^{]*\{[^}]*background: var\(--wash\)/);
    expect(css).not.toMatch(/\.ts-sumbtn/);
  });
});
