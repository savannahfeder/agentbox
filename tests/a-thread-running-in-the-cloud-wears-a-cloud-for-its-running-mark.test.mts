// A THREAD RUNNING IN THE CLOUD WEARS A CLOUD FOR ITS RUNNING MARK.
//
// What she said (2026-10-19), with the cloud on: "It's also really hard to
// tell which is in the cloud because when I see this I'm like, 'I must assume
// all of them are in the cloud.'" Every running row wore the same turning
// half-dot whether its agent was in a cloud sandbox or on her Mac. Of five
// drawings on her own inbox she picked the one where the running mark itself
// becomes a small orange cloud, gently pulsing, so nothing is added to the row
// and a private thread's lock stays as it was.
//
// Now a run in the cloud (`where: 'cloud'` on its running entry) draws the
// cloud in place of the dot, in the list and on the board. A run on this Mac
// keeps the dot, and a thread nothing is running on draws neither.
//
// THE MARK MOVED OUT OF THE TITLE AND INTO THE STATUS COLUMN (w-ec2b04d449),
// in her words "move the cloud stuff into there rather than having it in the
// query itself", so the row reads its run off the fleet rather than off the
// live ids. The rule above is unchanged and is what these still measure.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import { ThreadCells, InboxBoard, LiveContext, CloudContext } from '../renderer/src/threads/Pages.tsx';
import { FleetContext } from '../renderer/src/fleet.ts';
import { TeamContext } from '../renderer/src/team/people.tsx';
globalThis.React = React;

const NOW = Date.now();
const DAY = 86_400_000;
const ME = 'p-me';
const product = { slug: 'northwind', name: 'Northwind', team: { visibility: 'team', people: [] } };
const item = (o = {}) => ({
  id: 'w-1', product: 'northwind', productName: 'Northwind', status: 'open', title: 'Acme renewal terms', kind: 'directive',
  labels: ['founder'], priority: 5, epoch: 0, claim: null, createdAt: NOW - 30 * DAY, updatedAt: NOW - DAY, createdBy: ME, ...o,
});
const team = { state: { since: NOW - 7 * DAY, signedIn: true }, me: ME, byId: new Map(), products: new Map() };
const h = React.createElement;
const fleetOf = (live, cloud) => ({
  queued: [],
  sessions: new Map(live.map((id) => [id, { itemId: id, product: 'northwind', startedAt: NOW - 60_000, tail: [], ...(cloud.includes(id) ? { where: 'cloud' } : {}) }])),
});
const within = ({ live = [], cloud = [] }, child) => renderToStaticMarkup(
  h(TeamContext.Provider, { value: team },
    h(FleetContext.Provider, { value: fleetOf(live, cloud) },
      h(LiveContext.Provider, { value: new Set(live) },
        h(CloudContext.Provider, { value: new Set(cloud) }, child)))),
);
const row = (it, sets) => within(sets, h(ThreadCells, { item: it, product, now: NOW }));
const dots = (html) => (html.match(/th-st s-running live/g) ?? []).length;
const clouds = (html) => (html.match(/th-st-cloud/g) ?? []).length;

describe('the running mark on a row', () => {
  it('is a cloud, and not the dot, while its agent runs in the cloud', () => {
    const html = row(item(), { live: ['w-1'], cloud: ['w-1'] });
    expect(clouds(html)).toBe(1);
    expect(dots(html)).toBe(0);
    expect(html).toMatch(/in the cloud/i);
  });

  it('stays the dot while its agent runs on this Mac', () => {
    const html = row(item(), { live: ['w-1'], cloud: [] });
    expect(dots(html)).toBe(1);
    expect(clouds(html)).toBe(0);
  });

  it('is neither while nothing runs on it', () => {
    const html = row(item(), { live: [], cloud: [] });
    expect(dots(html) + clouds(html)).toBe(0);
  });

  // The title cell is the title, its lock and nothing else: the running mark
  // is a column over now, so neither shape crowds the words (w-ec2b04d449).
  it('leaves a private thread its lock, and keeps both marks out of the title', () => {
    const html = row(item({ createdAt: NOW - 30 * DAY }), { live: ['w-1'], cloud: ['w-1'] });
    expect(html).toMatch(/aria-label="Private"/);
    const titleCell = html.slice(html.indexOf('th-cell-title'), html.indexOf('th-cell-state'));
    expect(titleCell).toContain('Acme renewal terms');
    expect(clouds(titleCell) + dots(titleCell)).toBe(0);
  });
});

describe('the running mark on a board card', () => {
  const display = { view: 'board', sort: 'updated', priorities: [], projects: [], updated: 'any' };
  const board = (sets) => within(sets, h(InboxBoard, { items: [item()], products: [product], display, now: NOW, onOpenItem: () => {}, picked: [ME] }));
  it('is the same cloud in the cloud', () => {
    const html = board({ live: ['w-1'], cloud: ['w-1'] });
    expect(html).toMatch(/th-card/);
    expect(clouds(html)).toBe(1);
    expect(dots(html)).toBe(0);
  });
  it('and the same dot on this Mac', () => {
    const html = board({ live: ['w-1'], cloud: [] });
    expect(dots(html)).toBe(1);
    expect(clouds(html)).toBe(0);
  });
});

describe('the pulse', () => {
  const css = fs.readFileSync(new URL('../renderer/src/threads/pages.css', import.meta.url), 'utf8');
  it('stops for someone who asked for less motion', () => {
    const reduced = css.slice(css.indexOf('prefers-reduced-motion'));
    expect(reduced).toMatch(/\.th-st-cloud[^}]*animation:\s*none/);
  });
});
