// THE "ADD YOUR RECENT AGENTS" STEP NEVER HOLDS THE SETUP.
//
// A tester's first setup on a Mac froze on this step (2026-11-16). Its button
// waited on the import with no limit of its own, and Skip and Back are greyed
// out while it waits; the import has a five-minute limit behind it, and a
// press that threw left the step on "Adding…" for good. Now the step waits at
// most BRING_IN_WAIT_MS, then moves on, and the import carries on behind it.
// Measured with fake timers below, against an import that never answers, one
// that throws, and one that answers in time.
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import { bringInWithin, BRING_IN_WAIT_MS } from '../renderer/src/setup-split';

afterEach(() => { vi.useRealTimers(); });

describe('Add to your inbox waits a bounded time', () => {
  it('gives the count when the import answers in time', async () => {
    expect(await bringInWithin(async () => 3)).toBe(3);
  });

  it('gives up at the limit on an import that never answers', async () => {
    vi.useFakeTimers();
    let settled = false;
    const out = bringInWithin(() => new Promise<number>(() => {})).then((n) => { settled = true; return n; });
    await vi.advanceTimersByTimeAsync(BRING_IN_WAIT_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await out).toBeNull();
  });

  it('takes an answer that lands just inside the limit', async () => {
    vi.useFakeTimers();
    const out = bringInWithin(() => new Promise<number>((r) => setTimeout(() => r(2), BRING_IN_WAIT_MS - 1)));
    await vi.advanceTimersByTimeAsync(BRING_IN_WAIT_MS);
    expect(await out).toBe(2);
  });

  it('moves on from an import that throws', async () => {
    expect(await bringInWithin(async () => { throw new Error('no'); })).toBeNull();
  });

  it('is short enough not to read as frozen', () => {
    expect(BRING_IN_WAIT_MS).toBeLessThanOrEqual(20_000);
  });
});

describe('the step and the first run use it', () => {
  it('the step waits through bringInWithin and moves on whatever it answers', () => {
    const src = fs.readFileSync('renderer/src/components/SetupSplit.tsx', 'utf8');
    const bring = src.slice(src.indexOf('const bring = useCallback'), src.indexOf('const [browsing'));
    expect(bring).toMatch(/await bringInWithin\(p\.bringIn\)/);
    expect(bring).toMatch(/setBusy\(false\);[\s\S]*next\(\);/);
  });

  it("the first run's own busy flag is cleared even when a press throws", () => {
    const src = fs.readFileSync('renderer/src/components/FirstRun.tsx', 'utf8');
    const bringIn = src.slice(src.indexOf('const bringIn = useCallback'), src.indexOf('// THE KEYBOARD'));
    expect(bringIn).toMatch(/finally \{ setBusy\(false\); \}/);
  });
});
