// A LOGIN FILE REWRITTEN WITHIN ONE TICK OF THE CLOCK IS READ AGAIN.
//
// How it was measured (2026-10-23): on the Linux box this branch was built on,
// `tests/an-account-whose-subscription-ended-says-so` failed six times out of
// six on the branch and passed six out of six on main, with no difference in
// the code either test touches. The cause was neither: `readPlan` cached the
// plan under the file's mtime, and the two writes that test makes landed in
// the same tick of this filesystem's clock, so the second read came back with
// the first file's answer. A subscription renewed inside that window read as
// ended, and `Supervisor#_forgetRenewedSubscriptions` left the account out.
//
// The cache now carries the size as well, which these two logins differ in.
// A rewrite of exactly the same length in the same tick is still a cache hit,
// and the last case here says so rather than pretending otherwise.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readPlan } from '../main/claude-plan.mjs';

const lapsed = { billingType: 'none', organizationType: 'claude_max', organizationRateLimitTier: 'default_claude_max_20x' };
const paying = { billingType: 'stripe_subscription', organizationType: 'claude_max', organizationRateLimitTier: 'default_claude_max_20x' };

let dir, file;
beforeEach(() => {
  dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'plan-tick-')));
  file = path.join(dir, '.claude.json');
});
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

/** One tick of the clock, held still: every write here carries this mtime. */
const TICK = Math.floor(new Date(2026, 9, 23, 9, 0, 0).getTime() / 1000);
const write = (text) => {
  fs.writeFileSync(file, text);
  fs.utimesSync(file, TICK, TICK);
  return fs.statSync(file).mtimeMs;
};
const writeAt = (account) => write(JSON.stringify({ oauthAccount: account }));

describe('reading a plan twice', () => {
  it('her case: a subscription renewed in the same tick reads as paying, not ended', () => {
    const tick = writeAt(lapsed);
    expect(readPlan('x', { file }).ended).toBe(true);
    expect(writeAt(paying)).toBe(tick);
    expect(readPlan('x', { file }).ended).toBe(false);
  });

  it('reads an ended one again the same way round', () => {
    writeAt(paying);
    expect(readPlan('x', { file }).ended).toBe(false);
    writeAt(lapsed);
    expect(readPlan('x', { file }).ended).toBe(true);
  });

  it('still answers from the cache while nothing about the file has moved', () => {
    writeAt(lapsed);
    expect(readPlan('x', { file })).toBe(readPlan('x', { file }));
  });

  it('must NOT be expected to notice a rewrite of the same length in the same tick', () => {
    const text = (account) => JSON.stringify({ oauthAccount: account });
    // Trailing spaces are nothing to JSON and make the two writes one length.
    const width = Math.max(text(lapsed).length, text(paying).length);
    const pad = (s) => s + ' '.repeat(width - s.length);
    write(pad(text(lapsed)));
    expect(readPlan('x', { file }).ended).toBe(true);
    write(pad(text(paying)));
    expect(readPlan('x', { file }).ended).toBe(true);
  });
});
