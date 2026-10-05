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

// CHANGED 2026-10-05 (w-54e9c7243f, later on this same thread): the two
// parts are Context (`problem`) and Done (`progress`); Solution is not drawn.
describe('an unwritten summary line', () => {
  it('leaves out Done, heading and all, when nothing is done yet (the reported case)', () => {
    const w = words({ problem: 'Too many subscriptions.', solution: 'Fitness SF is $100 a month.' });
    expect(w).toMatch(/Context Too many subscriptions\. Status/);
    expect(w).not.toContain('Done');
    expect(w).not.toContain('Not written yet');
  });

  it('counts a line of only spaces as empty', () => {
    const w = words({ problem: 'Too many subscriptions.', progress: '   ' });
    expect(w).not.toContain('Done');
    expect(w).not.toContain('Not written yet');
  });

  it('draws only the name when both are empty', () => {
    const w = words({ title: '', label: 'Cutting subscriptions', body: '', problem: '', progress: '', solution: '' });
    for (const h of ['Context', 'Done', 'Not written yet']) expect(w).not.toContain(h);
    expect(w).toMatch(/^Cutting subscriptions Status/);
  });

  // The case that must NOT be hidden.
  it('still draws both parts when they have words, including the stand-in read off the ask', () => {
    const w = words({ body: 'Cut what we do not use.', progress: 'Listing them.' });
    expect(w).toMatch(/Context Cut what we do not use\. Done Listing them\./);
  });
});
