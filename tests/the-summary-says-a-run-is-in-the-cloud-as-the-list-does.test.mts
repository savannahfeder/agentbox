// THE SUMMARY SAYS A RUN IS IN THE CLOUD, AS THE LIST DOES.
//
// What they saw (w-a81175a837, 2026-10-24): the inbox row wore the orange cloud
// beside WORKING, and the same thread's summary panel showed the plain
// half-dot beside Working. Measured by reading the code: the list's mark
// (Pages.tsx StatusMark) drew RunningMark with the cell's `cloud`, and the
// panel's StatusGlyph read `live` and `mark` and never `cloud`.
//
// Now the panel's Status row and the mark leading the line under the title draw
// the same cloud while the run is in the cloud, the dot while it is on this
// Mac, and neither while nothing runs.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SummaryPanel, ThreadStateMark } from '../renderer/src/threads/Summary.tsx';
import { ThreadCells } from '../renderer/src/threads/Pages.tsx';
import { FleetContext } from '../renderer/src/fleet.ts';
globalThis.React = React;

const NOW = Date.now();
const M = 60_000;
const h = React.createElement;
const item = {
  id: 'w-1', product: 'northwind', productName: 'Northwind', status: 'claimed', title: 'Promo video', kind: 'directive',
  labels: ['founder'], priority: 5, epoch: 0, claim: { holder: 'h', leaseUntil: NOW + 5 * M }, createdAt: NOW - 60 * M, updatedAt: NOW - 7 * M,
};
const product = { slug: 'northwind', name: 'Northwind' };
const fleetOf = (where) => ({
  queued: [],
  sessions: where ? new Map([['w-1', { itemId: 'w-1', product: 'northwind', startedAt: NOW - 19 * M, tail: [], ...(where === 'cloud' ? { where: 'cloud' } : {}) }]]) : new Map(),
});
const within = (where, el) => renderToStaticMarkup(h(FleetContext.Provider, { value: fleetOf(where) }, el));
const panel = (where, it = item) => within(where, h(SummaryPanel, { item: it, items: [it], team: null }));
const lead = (where) => within(where, h(ThreadStateMark, { item }));
const listRow = (where) => within(where, h(ThreadCells, { item, product, now: NOW }));
const statusRow = (html) => html.slice(html.indexOf('>Status<'), html.indexOf('>Priority<'));
const clouds = (html) => (html.match(/th-st-cloud/g) ?? []).length;
const dots = (html) => (html.match(/ts-st-working live/g) ?? []).length;

describe('the summary panel\'s Status row', () => {
  it('wears the cloud while the run is in the cloud, as the inbox row does', () => {
    expect(clouds(listRow('cloud'))).toBe(1);
    const row = statusRow(panel('cloud'));
    expect(row).toContain('Working');
    expect(clouds(row)).toBe(1);
    expect(dots(row)).toBe(0);
  });

  it('keeps the half-dot while the run is on this Mac', () => {
    const row = statusRow(panel('mac'));
    expect(dots(row)).toBe(1);
    expect(clouds(row)).toBe(0);
  });

  it('wears neither while nothing runs', () => {
    const row = statusRow(panel(null, { ...item, status: 'open', claim: null }));
    expect(clouds(row) + dots(row)).toBe(0);
  });
});

describe('the mark leading the line under the title', () => {
  it('is the cloud in the cloud and the dot on this Mac', () => {
    expect(clouds(lead('cloud'))).toBe(1);
    expect(dots(lead('cloud'))).toBe(0);
    expect(dots(lead('mac'))).toBe(1);
    expect(clouds(lead('mac'))).toBe(0);
  });
});
