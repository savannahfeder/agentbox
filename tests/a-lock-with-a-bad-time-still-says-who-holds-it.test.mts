// A LOCK WITH A TIME NO DATE CAN HOLD CRASHED THE TIMEOUT MESSAGE.
//
// When a project's lock could not be taken in time, the error was built with
// `new Date(held.at).toISOString()`. A holder whose `at` is past the largest
// date (finite, so never counted as stale) made that throw "Invalid time
// value", hiding which pid held the lock. Measured by holding the lock under
// this process's own pid and waiting out a short timeout, async and sync.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { withProjectLock, withProjectLockSync } from '../main/store/project-lock.mts';

let dir: string;
const hold = (at: unknown) => fs.writeFileSync(path.join(dir, '.lock'), JSON.stringify({ token: 't', pid: process.pid, at, label: 'a test' }));
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bad-lock-time-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('a lock that cannot be taken in time', () => {
  it('names its holder even when its time is past the largest date', async () => {
    hold(8.64e15 + 1);
    await expect(withProjectLock(dir, () => 1, { timeoutMs: 50 })).rejects.toThrow(/could not lock .* \(held by pid \d+ for a test\)/);
    expect(() => withProjectLockSync(dir, () => 1, { timeoutMs: 50 })).toThrow(/could not lock .* \(held by pid \d+ for a test\)/);
  });

  it('still says since when when the time is a real one', async () => {
    hold(Date.now());
    await expect(withProjectLock(dir, () => 1, { timeoutMs: 50 })).rejects.toThrow(/held by pid \d+ for a test since \d{4}-\d\d-\d\dT/);
    expect(() => withProjectLockSync(dir, () => 1, { timeoutMs: 50 })).toThrow(/since \d{4}-\d\d-\d\dT/);
  });
});
