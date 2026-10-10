// On 2026-10-07 Settings showed 100% weekly usage beside a newly upgraded
// account. The reader had zero account selectors and Settings zero refresh
// controls. These invented readings reproduce the mismatch without a CLI run.
import { describe, expect, it, vi } from 'vitest';
import { ClaudeUsage, STALE_MS } from '../main/claude-usage.mjs';

const output = percent => `Current session: 0% used\nCurrent week (all models): ${percent}% used`;
function setup(profile = 'default') {
  let selected = profile, clock = 1_000_000;
  const calls = [], changed = vi.fn();
  const usage = new ClaudeUsage({
    bin: () => '/bin/claude', account: () => ({ profile: selected }), now: () => clock,
    where: () => '/empty', onChange: changed,
    run: (bin, args, opts, done) => calls.push({ bin, args, opts, done }),
  });
  return { usage, calls, changed, select: p => selected = p, advance: ms => clock += ms };
}

describe('usage belongs to the account being used', () => {
  it('reads the selected profile instead of the default subscription', () => {
    const s = setup('/profiles/second');
    s.usage.read();
    expect(s.calls[0].opts.env.CLAUDE_CONFIG_DIR).toBe('/profiles/second');
    s.calls[0].done(null, output(12));
    expect(s.usage.peek()).toMatchObject({ profile: '/profiles/second', limits: [{ percent: 0 }, { percent: 12 }] });
  });

  it('drops a fresh 100% reading immediately when the selected account changes', () => {
    const s = setup();
    s.usage.read(); s.calls[0].done(null, output(100));
    s.select('/profiles/upgraded');
    expect(s.usage.peek()).toBeNull();
    expect(s.calls).toHaveLength(1); // Looking at the other engine spawns nothing.
    s.usage.read();
    expect(s.calls).toHaveLength(2);
    s.calls[1].done(null, output(10));
    expect(s.usage.peek().limits[1].percent).toBe(10);
  });

  it('discards a result that arrives after switching accounts', async () => {
    const s = setup();
    s.usage.read(); s.select('/profiles/second');
    const refresh = s.usage.refreshNow();
    s.calls[0].done(null, output(100));
    await Promise.resolve();
    expect(s.usage.peek()).toBeNull();
    expect(s.calls).toHaveLength(2);
    s.calls[1].done(null, output(9));
    expect(await refresh).toMatchObject({ ok: true, reading: { profile: '/profiles/second' } });
  });

  it('scrubs inherited billing and login overrides for the default account', () => {
    const env = { ANTHROPIC_API_KEY: 'invented', CLAUDE_CODE_OAUTH_TOKEN: 'invented', CLAUDE_CONFIG_DIR: '/wrong', CLAUDECODE: '1', CLAUDE_PID: '5', CLAUDE_EFFORT: 'high' };
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    try {
      const s = setup(); s.usage.read();
      for (const key of Object.keys(env)) expect(s.calls[0].opts.env).not.toHaveProperty(key);
    } finally { vi.unstubAllEnvs(); }
  });
});

describe('refresh after upgrading a plan', () => {
  it('bypasses the fresh cache, coalesces clicks, and waits for the new reading', async () => {
    const s = setup(); s.usage.read(); s.calls[0].done(null, output(100));
    const first = s.usage.refreshNow(), second = s.usage.refreshNow();
    expect(s.calls).toHaveLength(2);
    expect(s.usage.peek().limits[1].percent).toBe(100);
    s.calls[1].done(null, output(20));
    for (const result of await Promise.all([first, second])) expect(result).toMatchObject({ ok: true, reading: { limits: [{ percent: 0 }, { percent: 20 }] } });
  });

  it('keeps a failed reading old, says refresh failed, and allows an immediate retry', async () => {
    const s = setup(); s.usage.read(); s.calls[0].done(null, output(100));
    const old = s.usage.peek(); s.advance(1000);
    const failed = s.usage.refreshNow(); s.calls[1].done(new Error('offline'), '');
    expect(await failed).toMatchObject({ ok: false });
    expect(s.usage.peek()).toEqual(old);
    s.usage.read(); expect(s.calls).toHaveLength(2);
    const retry = s.usage.refreshNow(); s.calls[2].done(null, output(15));
    expect(await retry).toMatchObject({ ok: true });
  });

  it('does not accept plausible stdout from a failed command as a fresh reading', async () => {
    const s = setup(); const failed = s.usage.refreshNow();
    s.calls[0].done(new Error('failed'), output(100));
    expect(await failed).toMatchObject({ ok: false });
    expect(s.usage.peek()).toBeNull();
  });

  it('updates the checked time even if percentages stay the same', async () => {
    const s = setup(); s.usage.read(); s.calls[0].done(null, output(12));
    s.advance(1000); const refresh = s.usage.refreshNow(); s.calls[1].done(null, output(12));
    expect((await refresh).reading.at).toBe(1_001_000);
    expect(s.changed).toHaveBeenCalledTimes(2);
  });

  it('keeps normal reads cached until the exact five-minute boundary', () => {
    const s = setup(); s.usage.read(); s.calls[0].done(null, output(12));
    s.advance(STALE_MS - 1); s.usage.read(); expect(s.calls).toHaveLength(1);
    s.advance(1); s.usage.read(); expect(s.calls).toHaveLength(2);
  });
});
