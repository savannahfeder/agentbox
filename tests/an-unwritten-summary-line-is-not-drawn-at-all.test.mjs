// AN UNWRITTEN SUMMARY LINE IS NOT DRAWN AT ALL (w-54e9c7243f, 2026-10-04).
//
// What broke: a thread with nothing yet for Progress showed the PROGRESS
// heading over a dim "Not written yet", between two real lines. Feedback on
// it: "if something isn't written yet in the sidebar it should just not show
// the section entirely rather than having this ugly bit here." Measured by
// drawing the real panel with react-dom/server: the words "Not written yet"
// were in it, under the heading, whenever a line was empty.
//
// The rule now: a line with no words has no heading and no placeholder. A
// line that has words, even the stand-in read off the ask, is still drawn.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SummaryPanel } from '../renderer/src/threads/Summary.tsx';
globalThis.React = React;

const NOW = Date.now();
const item = (o = {}) => ({
  id: 'w-subs', product: 'personal', productName: 'Personal', status: 'open', title: 'Cutting subscriptions', kind: 'directive',
  labels: ['founder'], priority: 9, epoch: 0, claim: null, createdAt: NOW - 3_600_000, updatedAt: NOW - 60_000,
  ...o,
});
const words = (o) => renderToStaticMarkup(React.createElement(SummaryPanel, { item: item(o), team: null }))
  .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('an unwritten summary line', () => {
  it('leaves out Progress, heading and all, when only Progress is empty (the reported case)', () => {
    const w = words({ problem: 'Too many subscriptions.', solution: 'Fitness SF is $100 a month.' });
    expect(w).toMatch(/Problem Too many subscriptions\. Solution Fitness SF is \$100 a month\./);
    expect(w).not.toContain('Progress');
    expect(w).not.toContain('Not written yet');
  });

  it('leaves out Solution when nothing has been solved yet', () => {
    const w = words({ problem: 'Too many subscriptions.', progress: 'Listing them.' });
    expect(w).toMatch(/Problem Too many subscriptions\. Progress Listing them\./);
    expect(w).not.toContain('Solution');
  });

  it('counts a line of only spaces as empty', () => {
    const w = words({ problem: 'Too many subscriptions.', progress: '   ', solution: 'Cancelled two.' });
    expect(w).not.toContain('Progress');
    expect(w).not.toContain('Not written yet');
  });

  it('draws only the name when all three are empty', () => {
    const w = words({ title: '', label: 'Cutting subscriptions', body: '', problem: '', progress: '', solution: '' });
    for (const h of ['Problem', 'Progress', 'Solution', 'Not written yet']) expect(w).not.toContain(h);
    expect(w).toMatch(/^Cutting subscriptions Status/);
  });

  // The case that must NOT be hidden.
  it('still draws every line that has words, including the stand-in read off the ask', () => {
    const w = words({ body: 'Cut what we do not use.', progress: 'Listing them.', solution: 'Cancelled two.' });
    expect(w).toMatch(/Problem Cut what we do not use\. Progress Listing them\. Solution Cancelled two\./);
  });
});
