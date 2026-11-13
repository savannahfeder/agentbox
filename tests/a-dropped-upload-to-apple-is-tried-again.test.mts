// 2026-11-13, the 0.1.24 deploy: the app was built and notarised, then
// `notarytool submit` for the disk image ended with "Connection reset by peer"
// after 22 uploaded parts. release.mjs gave it one attempt, so the deploy
// stopped, an hour's wait was lost, and the only way on was a full rebuild.
// A dropped connection to Apple is ordinary; the steps that talk to Apple now
// try again, a few times, with a pause, and each has an end.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tryAgain } from '../scripts/lib/try-again.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const release = fs.readFileSync(path.join(root, 'scripts/release.mjs'), 'utf8');

describe('a step that talks to Apple', () => {
  const counting = (results) => {
    const calls = { n: 0, slept: [] };
    const step = () => results[calls.n++];
    const sleep = (ms) => calls.slept.push(ms);
    return { calls, step, sleep };
  };

  it('is tried again when the first attempt fails, and stops once it works', () => {
    const { calls, step, sleep } = counting([false, true, true]);
    expect(tryAgain(step, { tries: 3, pauseMs: 30_000, sleep })).toBe(true);
    expect(calls.n).toBe(2);
    expect(calls.slept).toEqual([30_000]);
  });

  it('is tried once when it works first time, with no pause', () => {
    const { calls, step, sleep } = counting([true]);
    expect(tryAgain(step, { tries: 3, pauseMs: 30_000, sleep })).toBe(true);
    expect(calls.n).toBe(1);
    expect(calls.slept).toEqual([]);
  });

  it('gives up after the last try, and does not pause after it', () => {
    const { calls, step, sleep } = counting([false, false, false, true]);
    expect(tryAgain(step, { tries: 3, pauseMs: 30_000, sleep })).toBe(false);
    expect(calls.n).toBe(3);
    expect(calls.slept).toEqual([30_000, 30_000]);
  });
});

describe('the release', () => {
  it('tries the disk image upload and the stapling again', () => {
    expect(release).toMatch(/run\('notarytool', 'xcrun', \[[\s\S]*?\], \{ tries: 3 \}\)/);
    expect(release).toMatch(/run\('stapler', 'xcrun', \['stapler', 'staple', dmg\], \{ tries: 3 \}\)/);
  });

  it('does not try the signing or the final check again, which a dropped connection cannot fix', () => {
    expect(release).toMatch(/run\('codesign', 'codesign', \[[^\]]*\]\);/);
    expect(release).toMatch(/run\('spctl', 'spctl', \[[^\]]*\]\);/);
  });

  it('never waits on Apple for ever', () => {
    expect(release).toMatch(/'--wait', '--timeout', '1h'/);
  });
});
