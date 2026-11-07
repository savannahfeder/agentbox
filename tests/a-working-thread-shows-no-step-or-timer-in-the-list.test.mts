// A WORKING THREAD SHOWS NO STEP OR TIMER IN THE LIST OR ON THE BOARD.
//
// In-progress cards read "Thinking, 5m", "Waiting on: Tester 3 compares team
// placements, 1m" or "Running T=$(grep -rlE …" under the title, and the
// person found it cluttered and asked for it gone. The step stays on the open
// thread, which is where you go to see what an agent is doing.
//
// Measured: Pages.tsx fed `doingWords(session)` into the list row's aside and
// a `th-card-doing` line on the board card.
import { it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

it('neither the list row nor the board card draws the running step', () => {
  const pages = read('../renderer/src/threads/Pages.tsx');
  expect(pages).not.toMatch(/doingWords|th-card-doing|activity\?\.at\(-1\)/);
});

it('the step-and-timer words are gone from the shared live line', () => {
  expect(read('../renderer/src/live-line.ts')).not.toMatch(/'Thinking'\)\.replace|export function doingWords/);
});

it('the row still says when tasks it filed wait for a yes', () => {
  expect(read('../renderer/src/threads/Pages.tsx')).toMatch(/toApproveWords\(waiting\.get\(`\$\{item\.product\}\/\$\{item\.id\}`\)\)/);
});
