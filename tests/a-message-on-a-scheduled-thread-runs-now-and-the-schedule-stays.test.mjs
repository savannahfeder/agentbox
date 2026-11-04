// A MESSAGE ON A SCHEDULED THREAD RUNS NOW, AND THE SCHEDULE STAYS.
//
// The chief of staff had parked its thread until Monday 8:30 for a
// standing check. Maya asked it for a Launch decisions doc there at 3:56pm and
// it sat unrun for 11 hours behind the schedule. Then "let it run now" ran it,
// and also wiped the Monday check: "Your reply cleared its time, and when I tried
// to set it again, the app kept it cleared." Measured on the fold: isDue read
// only runAt, the reply and the run-now button both wrote runAt 0 as her, and
// her 0 outranked the agent's later attempt to book Monday again.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { foldWorkItems, isDue, wordWaits } from '../shared/work-items.mjs';

const MONDAY = 10_000_000;
const fold = (...lines) => foldWorkItems([{ id: 'w', ts: 1, source: 'founder', patch: { title: 'Monday check', body: 'Check on Monday.' } }, ...lines], 5_000).get('w');
const parked = { id: 'w', ts: 2, source: 'agent', patch: { runAt: MONDAY } };
const asked = { id: 'w', ts: 3, source: 'founder', patch: { answer: 'Make one document called Launch decisions.' } };

describe('her message after the agent parked the thread', () => {
  it('runs now, and the Monday moment is still on the row', () => {
    const item = fold(parked, asked);
    expect(isDue(item, 5_000)).toBe(true);
    expect(wordWaits(item)).toBe(true);
    expect(item.runAt).toBe(MONDAY);
  });
  it('once the run has answered it, the thread waits for Monday again', () => {
    const item = fold(parked, asked, { id: 'w', ts: 4, source: 'system', patch: { answeredThrough: 3 } });
    expect(isDue(item, 5_000)).toBe(false);
    expect(isDue(item, MONDAY)).toBe(true);
  });
  it('a teammate’s words told to the thread run it now too', () => {
    const told = { id: 'w', ts: 3, source: 'system', patch: { answer: 'Sofia replied: sent.', from: { teammate: 'p-sofia', name: 'Sofia' } } };
    expect(isDue(fold(parked, told), 5_000)).toBe(true);
  });
});

describe('what still waits for its moment', () => {
  it('a message written before the thread was scheduled', () => {
    expect(isDue(fold(asked, { ...parked, ts: 4 }), 5_000)).toBe(false);
  });
  it('a message taken back', () => {
    expect(isDue(fold(parked, asked, { id: 'w', ts: 4, source: 'founder', patch: { answer: '(withdrawn)' } }), 5_000)).toBe(false);
  });
  it('a thread in Later, whatever was said', () => {
    expect(isDue(fold(parked, asked, { id: 'w', ts: 4, source: 'founder', patch: { start: 'later' } }), 5_000)).toBe(false);
  });
});

it('her clearing the moment does not stop the agent booking it again', () => {
  const item = fold(parked, { id: 'w', ts: 3, source: 'founder', patch: { runAt: 0 } }, { id: 'w', ts: 4, source: 'agent', patch: { runAt: MONDAY + 1 } });
  expect(item.runAt).toBe(MONDAY + 1);
});

it('a moment she set is still hers: an agent cannot move it', () => {
  const item = fold({ id: 'w', ts: 2, source: 'founder', patch: { runAt: MONDAY } }, { id: 'w', ts: 3, source: 'agent', patch: { runAt: MONDAY + 1 } });
  expect(item.runAt).toBe(MONDAY);
});

describe('the wiring', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  it('a reply no longer clears the moment', () => {
    const send = app.slice(app.indexOf('landed();'), app.indexOf("pushUndo({ label: 'Reply withdrawn"));
    expect(send).not.toMatch(/runAt: 0/);
  });
  it('run now keeps the moment when a word of hers is what it runs', () => {
    const unsnooze = app.slice(app.indexOf('const unsnooze = useCallback'), app.indexOf('const unsnooze = useCallback') + 2000);
    expect(unsnooze).toMatch(/\(i\.runAt \?\? 0\) > Date\.now\(\) && !wordWaits\(i\)/);
  });
});
