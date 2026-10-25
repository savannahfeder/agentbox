// THE TRAY NEVER CAME BACK (w-93b3a1a796, 2026-10-24). With the tray counting
// only what started waiting after you last left the app, the founder restarted
// and saw no tray anywhere. Each thread handed the tray the moment its status
// last changed. A status is written when a worker PICKS UP a thread (the claim
// line carries status 'claimed'), and the answer that later puts the thread in
// Needs you writes none (a release says nothing about status). So a thread you
// replied to, picked up while you were still in the app and answered after you
// left, looked older than your leaving and was never counted. That is how most
// threads reach Needs you.
//
// Measured with the store's own lines and fold (shared/work-items.mjs): the
// status moment of such a thread is the claim, minutes before the answer.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildClaimLine, buildLine, buildReleaseLine, foldWorkItems } from '../shared/work-items.mjs';
import { newSince } from '../shared/corner-tag.mjs';
import { waitingSince } from '../renderer/src/unread.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const minute = 60_000;
const T0 = Date.UTC(2026, 9, 24, 9, 0, 0);
const ID = 'w-0123456789';

// You wrote the thread and replied; a worker picked it up a minute later.
const start = () => [
  buildLine({ id: ID, source: 'founder', now: T0, patch: { title: 'Pricing page', body: 'Make the pricing page', labels: ['founder'], status: 'open' } }),
  buildLine({ id: ID, source: 'founder', now: T0 + minute, patch: { answer: 'Go ahead', status: 'open' } }),
  buildClaimLine({ id: ID, epoch: 1, holder: 'worker', now: T0 + 2 * minute }),
];
const answeredAt = (at) => [
  buildLine({ id: ID, epoch: 1, now: at, patch: { result: 'Done, the page is live.' } }),
  buildReleaseLine({ id: ID, epoch: 1, now: at + 1000 }),
];
const fold = (lines) => foldWorkItems(lines, T0 + 60 * minute).get(ID);
const isNew = (item, leftAt) => newSince([{ id: ID, since: waitingSince(item) }], leftAt).length === 1;

describe('a thread picked up before you left and answered after', () => {
  const leftAt = T0 + 3 * minute;
  const item = fold([...start(), ...answeredAt(T0 + 20 * minute)]);

  it('has a status moment from before you left, which is why it went uncounted', () => {
    expect(item.wrote.status.ts).toBe(T0 + 2 * minute);
    expect(item.wrote.status.ts).toBeLessThan(leftAt);
  });

  it('started waiting on you when it was answered, and counts as new', () => {
    expect(waitingSince(item)).toBe(T0 + 20 * minute);
    expect(isNew(item, leftAt)).toBe(true);
  });
});

describe('the cases either side', () => {
  it('does not count a thread answered before you left', () => {
    expect(isNew(fold([...start(), ...answeredAt(T0 + 2.5 * minute)]), T0 + 3 * minute)).toBe(false);
  });

  it('holds the boundary: answered the moment you left is seen, a moment after is new', () => {
    const leftAt = T0 + 10 * minute;
    expect(isNew(fold([...start(), ...answeredAt(leftAt)]), leftAt)).toBe(false);
    expect(isNew(fold([...start(), ...answeredAt(leftAt + 1)]), leftAt)).toBe(true);
  });

  it('counts a thread a worker marked blocked after you left, with no new answer', () => {
    const lines = [...start(), ...answeredAt(T0 + 2.5 * minute),
      buildLine({ id: ID, epoch: 1, now: T0 + 30 * minute, patch: { status: 'blocked' } })];
    expect(isNew(fold(lines), T0 + 3 * minute)).toBe(true);
  });

  it('counts a thread an agent filed after you left', () => {
    const item = fold([buildLine({ id: ID, now: T0 + 30 * minute, patch: { title: 'A proposal', body: 'x', status: 'open' } })]);
    expect(isNew(item, T0 + 3 * minute)).toBe(true);
  });

  it('falls back to when the row last changed for an old line with no record of who wrote what', () => {
    expect(waitingSince({ updatedAt: 42 })).toBe(42);
    expect(waitingSince({})).toBe(0);
  });
});

describe('the app hands the tray that moment', () => {
  it('dates each waiting thread with waitingSince, not its status alone', () => {
    const app = fs.readFileSync(path.join(root, 'renderer/src/App.tsx'), 'utf8');
    const tray = app.slice(app.indexOf('window.zero?.cornerTag?.('), app.indexOf('working: runningRows.length'));
    expect(tray).toMatch(/since: waitingSince\(i\)/);
    expect(tray).not.toMatch(/since: i\.wrote\?\.status\?\.ts/);
  });
});
