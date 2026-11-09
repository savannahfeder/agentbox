// A power tester on 2026-11-04 put off a thread whose agent was still working,
// and saw it twice in the list: under In progress as WORKING and under Later
// as SCHEDULED, with Later counting 2 where the board said 1. Reproduced in a
// test copy. A thread with a live agent is In progress even when put off
// (list-rules.ts), and the board lets In progress win, but the Later list took
// every put-off thread. It now leaves out a put-off thread while a session or
// the ship queue has it, as it already did for one waiting on another thread;
// it moves to Later when the run ends, where the board already puts it.
import { it, expect } from 'vitest';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const later = app.slice(app.indexOf('const snoozed = useMemo(() => ['), app.indexOf('].sort((a, b) => whenShown(a) - whenShown(b))', app.indexOf('const snoozed = useMemo(() => [')));

it('leaves a put-off thread out of Later while its agent works or it ships', () => {
  expect(later).toMatch(/\(hiddenAt\(i\) > now \|\| waitsInLater\(i, waitingOn\(i\)\)\) && !liveIds\.has\(i\.id\) && !shippingIds\.has\(i\.id\)/);
});

it('still takes threads not started yet and proposals, running or not', () => {
  expect(later).toMatch(/notStarted\(i\) \|\| isProposal\(i\)\s*\|\|/);
});
