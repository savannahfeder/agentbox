// A ROW IN THE TUTORIAL'S PRACTICE PROJECT NEVER SAYS NOTHING IS RUNNING.
//
// Measured on the QA box, 2026-10-23, on the tutorial's board: three cards in
// the In progress column each read NOTHING RUNNING, under a tutorial card
// saying "In progress is what agents are doing". Nothing is wrong with those
// rows. No agent is ever started in the practice project — the supervisor
// refuses to spawn there — so the fleet's silence about one of its rows says
// nothing about that row, which is the rule `fleetUnread` already keeps for a
// surface drawn before the first snapshot.
//
// The row says its own state word instead: In progress, the words the tab and
// the column over it already use.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { statusCell } from '../renderer/src/status-word.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// A row an agent was on and released, which is how every practice row is
// written (main/store.mjs stagePracticeBackdrop): claimed, released, no result.
const ran = { id: 'w-bd1', status: 'open', createdAt: 1_000, wrote: { body: { ts: 1_000, source: 'founder' } }, runs: 1 };
// The fleet, read and holding nothing, under the In progress column: the state
// that produced the sentence.
const FLEET = { queued: [], session: null, now: 2_000, inProgress: true, state: 'running' };

describe('a row in the practice project', () => {
  it('says what it is doing, not that nothing is running', () => {
    const cell = statusCell(ran, { ...FLEET, practice: true });
    expect(cell.word).toBe('In progress');
    expect(cell.agent).toBe(false);
  });

  it('says the same on the list, where the column is worked out from the row', () => {
    expect(statusCell(ran, { ...FLEET, state: undefined, practice: true }).word).not.toMatch(/Nothing running/i);
  });
});

describe('a row in a real project', () => {
  // THE CASE THAT MUST NOT MATCH. Outside the practice project the sentence is
  // news and has to keep being said: a read fleet with nothing on this thread
  // is the one fact "Nothing running" was written for.
  it('still says nothing is running when the fleet has been read and holds nothing', () => {
    const cell = statusCell(ran, { ...FLEET, practice: false });
    expect(cell.word).toMatch(/Nothing running/i);
  });

  it('and when nobody passed the flag at all', () => {
    expect(statusCell(ran, FLEET).word).toMatch(/Nothing running/i);
  });
});

describe('the two surfaces that draw a practice row', () => {
  const pages = read('renderer/src/threads/Pages.tsx');

  it('tell the cell which project the row is in', () => {
    // The list reads the project it is already drawing under; the board has to
    // find it, because its cards come from every project at once.
    expect(pages).toContain('inProgress: tab === \'progress\', now, practice: !!product?.practice');
    expect(pages).toContain('practice: !!products.find((p) => p.slug === e.item!.product)?.practice');
  });
});
