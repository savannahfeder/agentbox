// A TEAMMATE'S THREAD PAGE DRAWS ONE LINE BETWEEN ITS PARTS.
//
// Two testers opened Dev's "Seat picker for group bookings" from his page and
// saw two lines stacked between ABOUT and DONE in the card on the right. On
// that page every part drew the line under itself, and the Done part also drew
// one over itself (summary.css). 2026-11-21 (w-8a8eac7620): the card became
// the summary at the top of the page, whose parts are set apart by space and
// their labels, with no line between them at all.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TeammateSummary } from '../renderer/src/threads/Summary.tsx';

const pages = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/threads/pages.css'), 'utf8');

describe('the summary at the top of a teammate’s thread', () => {
  it('draws no line between its parts', () => {
    const card = { personId: 'dev', threadId: 't', visible: true, title: 'Seat picker', project: null, state: 'waiting', priority: null, problem: 'Group bookings need seats side by side.', progress: 'Drew the picker\nTests pass', solution: null, blockedBy: [], blocks: [{ id: 'w-x', title: 'Checkout' }], people: null, updatedAt: 1 };
    const html = renderToStaticMarkup(React.createElement(TeammateSummary, { card: card as never, owner: 'Dev' }));
    expect(html).toContain('ts-tk-part');
    expect(html).not.toMatch(/ts-tk-done|ts-tk-grid|ts-tk-next/);
    for (const m of pages.matchAll(/^\.tp-summary [^{]*\{([^}]*)\}/gm)) expect(m[1]).not.toMatch(/border/);
  });
});
