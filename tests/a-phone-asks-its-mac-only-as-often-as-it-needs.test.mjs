// A PHONE ASKS ITS MAC ONLY AS OFTEN AS IT NEEDS (2026-10-13).
//
// Through the relay every question a phone asks its Mac is a request we pay
// Cloudflare for. Measured in Cloudflare's own figures for the relay on
// 2026-10-12: about 19,300 requests in about four and a half hours of one
// person's phone, some 70 a minute, enough to use up the free plan with three
// to five people.
//
// The screen was built for a desktop, where asking the Mac is free, and it
// asked constantly. Counted in the code, a phone open on a thread with an
// agent working asked:
// - twice a second whether Claude or Codex was updating (AgentUpdates.tsx);
// - once a second whether the thread had Remote Control (RemoteControl.tsx);
// - every 4 to 15 seconds for the inbox, the thread, its steps and its change;
// - and again for the inbox and the thread on every "something changed" the
//   Mac pushed, which it does up to two and a half times a second while any
//   agent is writing (main/ipc.mjs, 400 ms).
//
// On a phone the timers now wait at least 30 seconds, since the pushes keep
// it current, and the pushes reach the screen at most once every 2 seconds,
// the last one always. The desktop is unchanged.
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pollEvery, atMostEvery, PHONE_POLL_MS, PHONE_PUSH_MS } from '../renderer/src/phone-polls.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, '..', 'renderer', 'src', ...p), 'utf8');

afterEach(() => { vi.useRealTimers(); });

describe('how often a timer asks', () => {
  it('a phone waits at least 30 seconds, however often the desktop asks', () => {
    expect(PHONE_POLL_MS).toBe(30_000);
    expect(pollEvery(1000, true)).toBe(30_000);
    expect(pollEvery(10_000, true)).toBe(30_000);
  });
  it('a timer already slower than that is left alone', () => {
    expect(pollEvery(3_600_000, true)).toBe(3_600_000);
  });
  it('the desktop asks exactly as it did', () => {
    expect(pollEvery(1000, false)).toBe(1000);
    expect(pollEvery(8000, false)).toBe(8000);
  });
});

describe('the Mac saying something changed', () => {
  it('a burst reaches the screen twice: at once, and once more at the end', () => {
    vi.useFakeTimers();
    const seen = [];
    const push = atMostEvery(PHONE_PUSH_MS, (n) => seen.push(n));
    for (let n = 1; n <= 5; n += 1) { push(n); vi.advanceTimersByTime(300); }
    expect(seen).toEqual([1]);
    vi.advanceTimersByTime(PHONE_PUSH_MS);
    expect(seen).toEqual([1, 5]);
  });

  it('a push after a quiet spell goes through at once', () => {
    vi.useFakeTimers();
    const seen = [];
    const push = atMostEvery(PHONE_PUSH_MS, (n) => seen.push(n));
    push(1);
    vi.advanceTimersByTime(PHONE_PUSH_MS + 1);
    push(2);
    expect(seen).toEqual([1, 2]);
  });

  it('a steady stream every 400 ms comes through every 2 seconds, not 2.5 times a second', () => {
    vi.useFakeTimers();
    let calls = 0;
    const push = atMostEvery(PHONE_PUSH_MS, () => { calls += 1; });
    for (let t = 0; t < 60_000; t += 400) { push(); vi.advanceTimersByTime(400); }
    vi.advanceTimersByTime(PHONE_PUSH_MS);
    expect(calls).toBeLessThanOrEqual(31);
    expect(calls).toBeGreaterThanOrEqual(29);
  });
});

describe('the screen uses them on a phone only', () => {
  it('the push is held back on a phone, and only that one channel', () => {
    const bridge = src('browser-bridge.ts');
    expect(bridge).toMatch(/phone && message\.channel === PUSH_CHANNELS\.onChanged/);
  });
  it.each([
    ['components/AgentUpdates.tsx', /setInterval\(poll,pollEvery\(1000,onPhone\(\)\)\)/],
    ['components/RemoteControl.tsx', /setInterval\(refresh,pollEvery\(1000,onPhone\(\)\)\)/],
    ['App.tsx', /setInterval\(refresh, pollEvery\(10_000, onPhone\(\)\)\)/],
    ['components/Focus.tsx', /setInterval\(read, pollEvery\(4000, onPhone\(\)\)\)/],
    ['components/Live.tsx', /setInterval\(read, pollEvery\(8000, onPhone\(\)\)\)/],
    ['components/ItemThread.tsx', /setInterval\(read, pollEvery\(REFRESH_MS, onPhone\(\)\)\)/],
  ])('%s asks at the phone pace', (file, pattern) => {
    expect(src(file)).toMatch(pattern);
  });
});
