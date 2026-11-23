// THE SUMMARY SAYS A RUN IS IN THE CLOUD, AS THE LIST DOES.
//
// What they saw (w-a81175a837, 2026-10-24): the inbox row wore the orange cloud
// beside WORKING, and the same thread's summary panel showed the plain
// half-dot beside Working. Measured by reading the code: the list's mark
// (Pages.tsx StatusMark) drew RunningMark with the cell's `cloud`, and the
// panel's StatusGlyph read `live` and `mark` and never `cloud`.
//
// Now the mark leading the line under the title draws the same cloud while the
// run is in the cloud and the dot while it is on this Mac. The panel went in
// 2026-11 (w-d143fcb40a).
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThreadStateMark } from '../renderer/src/threads/Summary.tsx';
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
const lead = (where) => within(where, h(ThreadStateMark, { item }));
const listRow = (where) => within(where, h(ThreadCells, { item, product, now: NOW }));
const clouds = (html) => (html.match(/th-st-cloud/g) ?? []).length;
const dots = (html) => (html.match(/ts-st-working live/g) ?? []).length;

describe('the mark leading the line under the title', () => {
  it('is the cloud in the cloud and the dot on this Mac', () => {
    expect(clouds(listRow('cloud'))).toBe(1);
    expect(clouds(lead('cloud'))).toBe(1);
    expect(dots(lead('cloud'))).toBe(0);
    expect(dots(lead('mac'))).toBe(1);
    expect(clouds(lead('mac'))).toBe(0);
  });
});
