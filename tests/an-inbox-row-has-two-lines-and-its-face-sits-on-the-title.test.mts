// AN INBOX ROW HAS TWO LINES, AND ITS FACE SITS ON THE TITLE.
//
// Asked on w-6714ad1360 (2026-11-22): the inbox felt overwhelming, with many
// one-line rows packed close and hard to tell apart. Measured on the founder's
// screenshot: 54px rows, about 13 on screen. The design picked over nine rounds
// of pictures (mixed-7-faces-24-semi-rounded-light-v4.png) gives every thread a
// second line saying what came back, led by who said it when that was a person
// or an AI teammate. It also draws one 24px face per row, its top on the top of
// the title's capitals, and centres status, project, priority and time on the
// two lines. The orange unread dot stays in the gutter, level with the title.
// Measured on the built page at the founder's zoom (2.4 pixels a point) by
// finding each face's and each letter's first row of ink: every face started on
// its title's first row, and every cell's middle sat within half a device pixel
// of the thread's middle. The phone keeps its own layout, so all of this is the
// desktop window's.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RowCells, ThreadCells } from '../renderer/src/threads/Pages.tsx';
import { TeamContext } from '../renderer/src/team/people.tsx';
import { TeammatesContext } from '../renderer/src/teammates/row-lead.tsx';
globalThis.React = React;

const pages = fs.readFileSync(new URL('../renderer/src/threads/pages.css', import.meta.url), 'utf8');

const ME = 'p-me', MAYA = 'p-maya';
const T = Date.parse('2026-11-22T12:00:00');
const people = { [ME]: { id: ME, name: 'Alex Rivera', avatarUrl: null }, [MAYA]: { id: MAYA, name: 'Maya Chen', avatarUrl: null } };
const shared = { slug: 'app', name: 'App', dir: '/tmp/a', team: { projectId: 'p', teamId: 't', visibility: 'team', people: [], sharedBy: null } };
const direct = { slug: 'dm', name: 'Maya Chen', dir: '/tmp/d', team: { projectId: 'd', teamId: 't', visibility: 'people', people: [ME, MAYA], sharedBy: MAYA, direct: true } };
const team = { state: { signedIn: true, cards: [] }, me: ME, byId: new Map(Object.entries(people)), products: new Map([[shared.slug, shared], [direct.slug, direct]]) };
const mates = new Map([['nova', { id: 'nova', name: 'Nova', letter: 'N' }]]);

const row = (over = {}) => ({ id: 'w-1', product: 'app', productName: 'App', status: 'open', kind: 'task', title: 'Fix the flaky sign-in test', labels: ['founder'], priority: 5, createdBy: ME, createdAt: T, updatedAt: T, ...over });
const draw = (item, product = shared, withTeam = true) => {
  const cells = React.createElement(TeammatesContext.Provider, { value: mates }, React.createElement(ThreadCells, { item, product, now: T + 60_000, tab: 'inbox' }));
  return renderToStaticMarkup(withTeam ? React.createElement(TeamContext.Provider, { value: team }, cells) : cells);
};
const lineOf = (html) => html.match(/<div class="th-line">([\s\S]*?)<\/div>/)?.[1] ?? null;
const whoOf = (html) => lineOf(html)?.match(/<span class="th-line-who">([^<]*)<\/span>/)?.[1] ?? null;
const answered = (text) => ({ result: text, wrote: { body: { ts: T - 1, source: 'founder' }, result: { ts: T, source: 'agent' } } });
// The rule for a selector inside the desktop window's two-line block.
const desk = pages.match(/\/\* TWO LINES A THREAD[\s\S]*?@media \(min-width: 701px\) and \(min-height: 521px\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
const rule = (sel) => desk.match(new RegExp(`\\n\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? null;

describe('the second line', () => {
  it('on your own thread is what its agent said, under the title', () => {
    const html = draw(row(answered('**It waited on a real clock. It has now passed 50 runs in a row.**')), shared, false);
    expect(lineOf(html)).toContain('It waited on a real clock.');
    expect(whoOf(html)).toBeNull();
    expect(html).toMatch(/^<div class="row-main th-grid has-line">/);
  });

  it("on an AI teammate's thread starts with the teammate's name", () => {
    const html = draw(row({ title: 'Outreach list for design agencies', labels: ['founder', 'teammate:nova'], ...answered('I found 40 agencies and drafted the first five emails.') }));
    expect(whoOf(html)).toBe('Nova');
    expect(lineOf(html)).toContain('I found 40 agencies');
  });

  it("on a person's message starts with their name and says what they wrote", () => {
    const html = draw(row({ id: 'w-2', product: 'dm', labels: [], label: 'Pricing page copy', title: 'Pricing page copy', body: 'Can you look at the new headline?', createdBy: MAYA, people: [MAYA, ME], wrote: { body: { ts: T, by: MAYA, source: 'founder' } } }), direct);
    expect(whoOf(html)).toBe('Maya Chen');
    expect(lineOf(html)).toContain('Can you look at the new headline?');
  });

  it('sits in the grid after the status, so the phone layout, which hides every cell but the first, second and last, never draws it', () => {
    const html = draw(row(answered('Done.')), shared, false);
    const order = [...html.matchAll(/<div class="(th-cell-[a-z]+|th-line)/g)].map((m) => m[1]);
    expect(order.slice(0, 3)).toEqual(['th-cell-title', 'th-cell-state', 'th-line']);
    expect(order.at(-1)).toBe('th-cell-when');
    expect(pages).toMatch(/\n\.th-line \{ display: none; \}/);
  });

  it('is not drawn when there is nothing to say, and the row stays one line', () => {
    const html = renderToStaticMarkup(React.createElement(RowCells, { title: 'A rule', where: 'App', priority: 5, updatedAt: 0, now: 0 }));
    expect(html).not.toContain('th-line');
    expect(html).toMatch(/^<div class="row-main th-grid">/);
  });

  it("does not say the title again", () => {
    const html = draw(row({ title: 'Fix the flaky sign-in test', body: 'Fix the flaky sign-in test' }), shared, false);
    expect(lineOf(html)).toBeNull();
  });
});

describe('who said it', () => {
  it('moves from after the title to the start of the second line on the desktop', () => {
    const html = draw(row({ title: 'Outreach list', labels: ['founder', 'teammate:nova'], ...answered('Forty agencies.') }));
    expect(html).toMatch(/<div class="th-cell-title subject[^"]* name-moved/);
    expect(rule('.th-cell-title.name-moved > .th-who-name')).toMatch(/display: none;/);
  });
});

describe('on the desktop', () => {
  it('a row is 17 + 20 + 3 + 18 + 17 = 75px tall, which is what a skipped row holds', () => {
    expect(rule('.th-table .row:not(.th-head)')).toMatch(/padding-top: 17px; padding-bottom: 17px;/);
    expect(rule('.th-table .row:not(.th-head) .th-grid.has-line')).toMatch(/row-gap: 3px;/);
    expect(rule('.th-table .row:not(.th-head) .th-grid.has-line > .th-line')).toMatch(/line-height: 18px;/);
    expect(pages).toMatch(/contain-intrinsic-size: auto 75px;/);
  });

  it('the face is 24px, at the top of the title\'s capitals, 5px into a 14.5px title\'s 20px line', () => {
    expect(rule('.th-table .row:not(.th-head) .th-cell-title')).toMatch(/font-size: 14\.5px;/);
    const slot = rule('.th-table .row:not(.th-head) .th-cell-title > .th-slot');
    expect(slot).toMatch(/position: absolute; left: 0; top: 5px; width: 24px; height: 24px;/);
    expect(rule('.th-table .row:not(.th-head) .th-slot :is(.tm-av, .tq, .th-mate, .harness-mark, .agent-face)')).toMatch(/width: 24px; height: 24px;/);
  });

  it('every face has the agents\' semi-rounded corner and one soft edge', () => {
    expect(rule('.th-table .row:not(.th-head) .th-slot :is(.tm-av, .tq, i.mate-face, .harness-mark)')).toMatch(/border-radius: 7px;/);
    expect(desk).toMatch(/--face-ring: color-mix\(in srgb, var\(--text\) 8%, transparent\);/);
  });

  it('status, project, priority and time span both lines and sit in their middle', () => {
    expect(rule('.th-table .row:not(.th-head) .th-grid.has-line > :is(.th-cell-state, .th-cell-proj, .th-cell-person, .th-cell-prio, .th-cell-when)')).toMatch(/grid-row: 1 \/ span 2; align-self: center;/);
  });

  it("a status cell's hover card still draws over the rows under it", () => {
    expect(rule('.th-table .row:not(.th-head) .th-cell-state.has-card:hover')).toMatch(/z-index: 30;/);
  });

  // Picked out of four placements (inbox-two-lines-in-the-app-light-v3.png). The face's middle is
  // 17 + 5 + 12 - 0.36 = 33.64px into the row, so the 6px dot starts at 30.64px. Measured by ink: the
  // dot's middle within half a device pixel of the face's at 2.4 pixels a point.
  it("an unread thread's dot stays in the gutter, level with the middle of the face beside it", () => {
    expect(rule('.th-table .row.unread::before')).toMatch(/top: 30\.64px;/);
    expect(rule('.th-table .row.unread::before')).not.toMatch(/display: none/);
    expect(pages).toMatch(/:root \.th-table \.row\.unread \.subject \{ font-weight: 530; \}/);
  });
});
