// A SLOW TEST ON A BUSY MAC IS NOT A FAILING TEST.
//
// What broke (w-c121bd85e6, 2026-10-04): one branch bounced twice in half an
// hour on tests that had nothing to do with its change. At load 114 the ship
// said
//
//   ❯ tests/a-signed-out-codex-comes-back-on-its-own-end-to-end.test.mjs (8 tests | 1 failed) 9998ms
//
// and that 9998 is a ten-second ceiling being hit, not an assertion going
// red. The same file on the same branch, run by itself at load 63: 8 tests
// passed in 1,592 ms, six times inside the limit. The test was sound and the
// limit was too tight for a Mac that runs a dozen agents at once.
//
// So two numbers are pinned here, and the point of pinning them is the
// relationship between them rather than either on its own.
//
//   1. vitest's own ceilings. Its defaults are 5 s for a test and 10 s for a
//      hook, written for a laptop running one suite. Every end-to-end test in
//      this repo drives real processes on a machine that is never idle.
//   2. tests/waiting.mjs, the helper those tests wait with. Its deadline has
//      to sit UNDER vitest's, or vitest kills the test first and the message
//      is its generic one instead of the helper's, which names what the test
//      was actually waiting for.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { BUSY_MAC_MS, waitFor, waitUntilNo } from './waiting.mjs';

const config = fs.readFileSync(path.resolve('vitest.config.mjs'), 'utf8');
const numberFor = (key) => Number(config.match(new RegExp(`${key}:\\s*([0-9_]+)`))?.[1].replace(/_/g, ''));

describe('the ceilings the whole suite runs under', () => {
  it('gives a test and a hook far more room than vitest\'s 5 and 10 seconds', () => {
    expect(numberFor('testTimeout')).toBeGreaterThanOrEqual(60_000);
    expect(numberFor('hookTimeout')).toBeGreaterThanOrEqual(60_000);
  });

  it('leaves the waiting helper room to give up FIRST, so its message is the one shown', () => {
    expect(BUSY_MAC_MS).toBeLessThan(numberFor('testTimeout'));
    expect(BUSY_MAC_MS).toBeLessThan(numberFor('hookTimeout'));
  });

  it('still allows for the six times measured between an idle Mac and a loaded one', () => {
    expect(BUSY_MAC_MS).toBeGreaterThanOrEqual(10_000);
  });
});

describe('waiting on the thing rather than on a clock', () => {
  it('carries on the moment it happens, without spending the deadline', async () => {
    const began = Date.now();
    expect(await waitFor('a thing that is already true', () => 'here')).toBe('here');
    expect(Date.now() - began).toBeLessThan(1000);
  });

  it('waits through however many checks it takes', async () => {
    let checks = 0;
    const got = await waitFor('the fifth check', () => (++checks >= 5 ? checks : false));
    expect(got).toBe(5);
  });

  it('takes an async condition, which is how a real session is read', async () => {
    expect(await waitFor('an async thing', async () => 'done')).toBe('done');
  });

  it('gives up LOUDLY, naming what it was waiting for', async () => {
    await expect(waitFor('the session to finish', () => false, { ms: 60, every: 10 }))
      .rejects.toThrow(/waited .* for the session to finish and it never happened/);
  });

  it('must NOT take a falsy answer for the thing having happened', async () => {
    await expect(waitFor('a zero', () => 0, { ms: 60, every: 10 })).rejects.toThrow(/a zero/);
    await expect(waitFor('an empty string', () => '', { ms: 60, every: 10 })).rejects.toThrow(/an empty string/);
  });

  it('waits for something to END, too', async () => {
    let busy = 3;
    await waitUntilNo('the work to stop', () => (busy -= 1) > 0);
    expect(busy).toBe(0);
    await expect(waitUntilNo('work that never stops', () => true, { ms: 60, every: 10 }))
      .rejects.toThrow(/work that never stops/);
  });
});
