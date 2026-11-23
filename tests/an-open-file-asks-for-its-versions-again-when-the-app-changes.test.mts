// On 2026-11-16 two power testers kept a file open beside a cloud thread while
// its agent rewrote it or saved its next version. The answer said the file was
// saved, and the open panel kept the old version with nothing newer to step to,
// for up to 49 minutes. The panel asked for the file's versions only when the
// thread gained a line, and a cloud run's files reach this Mac after its
// answer does. Asking on every change in the app was what made Files slow on
// 2026-11-02, so an open file asks at most every few seconds, and always once
// after the last change.
import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { askAtMostEvery } from '../renderer/src/ask-at-most-every.ts';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

it('asks once after a change', () => {
  const read = vi.fn();
  const ask = askAtMostEvery(3000, read);
  ask.changed();
  vi.advanceTimersByTime(3000);
  expect(read).toHaveBeenCalledTimes(1);
});

it('asks once for a burst of changes, however long the burst', () => {
  const read = vi.fn();
  const ask = askAtMostEvery(3000, read);
  for (let t = 0; t < 10_000; t += 200) { ask.changed(); vi.advanceTimersByTime(200); }
  // A steady stream of changes still asks every few seconds, not never.
  expect(read.mock.calls.length).toBeGreaterThanOrEqual(3);
  expect(read.mock.calls.length).toBeLessThanOrEqual(4);
  vi.advanceTimersByTime(3000);
  expect(read.mock.calls.length).toBeLessThanOrEqual(5);
});

it('asks nothing while nothing changes, and nothing after it is stopped', () => {
  const read = vi.fn();
  const ask = askAtMostEvery(3000, read);
  vi.advanceTimersByTime(60_000);
  expect(read).not.toHaveBeenCalled();
  ask.changed();
  ask.stop();
  vi.advanceTimersByTime(60_000);
  expect(read).not.toHaveBeenCalled();
});

it('is what the open file panel reads its versions with', () => {
  const src = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/file-numbers.ts'), 'utf8');
  expect(src).toContain('askAtMostEvery(');
  const panel = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/components/ThreadArtifacts.tsx'), 'utf8');
  expect(panel).not.toMatch(/useFileLine\([^)]*,\s*false\)/);
});
