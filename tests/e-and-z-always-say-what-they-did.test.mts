// E AND Z ALWAYS SAY WHAT THEY DID (w-34443a206b).
//
// Testers on 2026-11-22: E warned that one thread's agent was waiting, and
// the next E closed a different thread with no warning (3). E sometimes did
// nothing and said nothing, and Z pressed minutes later did nothing and said
// nothing (2). Read in App.tsx and renderer/src/stray-letters.ts:
//   - the warning was marked learned the moment it was shown, so the press
//     after it went through on whatever row was under the keys, warned or not;
//   - E on the In progress and Done lists did nothing, silently;
//   - a Z waits 250ms to see whether it is typing, and a second Z inside that
//     wait (the quick answer to "Press Z again") dropped both.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pressAgainGoesAhead } from '../renderer/src/stopped-agent.ts';
import { eOnThisList } from '../renderer/src/keys.ts';
import { BURST_MS, installStrayLetters, strayLetters } from '../renderer/src/stray-letters.ts';

const app = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/App.tsx'), 'utf8');

describe('the press after a stuck-agent warning', () => {
  const a = { product: 'p', id: 'w-a' };
  const b = { product: 'p', id: 'w-b' };

  it('goes ahead on the thread it warned about', () => {
    expect(pressAgainGoesAhead('p:w-a', a)).toBe(true);
  });

  it('is warned again on another thread, or when nothing was warned', () => {
    expect(pressAgainGoesAhead('p:w-a', b)).toBe(false);
    expect(pressAgainGoesAhead(null, a)).toBe(false);
  });

  it('is what E asks, and the lesson is learned only once it went ahead', () => {
    const fn = app.slice(app.indexOf('const nudgeOnStopped'), app.indexOf('}, [stoppedWarned, showToast]);', app.indexOf('const nudgeOnStopped')));
    expect(fn).toMatch(/if \(pressAgainGoesAhead\(heldFor\.current, held\.goes\)\) \{[^}]*rememberWarned\(localStorage\); return false; \}/);
    expect(fn).toMatch(/heldFor\.current = `\$\{held\.goes\.product\}:\$\{held\.goes\.id\}`;\s*\n\s*showToast\(held\.say/);
  });
});

describe('E on a list where it closes nothing', () => {
  it('says why, on In progress and on Done', () => {
    expect(eOnThisList('progress')).toBe('Open this thread to close it.');
    expect(eOnThisList('done')).toBe('This thread is already done.');
  });

  it('is said by the list', () => {
    expect(app).toMatch(/else if \(chatRow && view === 'inbox'\) void chatRowDone\(chatRow\);\s*\n\s*else if \(pointed\) showToast\(eOnThisList\(view\)\);/);
  });
});

describe('two quick Zs', () => {
  let now = 0;
  let off: (() => void) | undefined;
  const reached: string[] = [];
  const listeners: ((e: unknown) => void)[] = [];
  const body = { tagName: 'BODY', isConnected: true, dispatchEvent: (e: { key: string; stopped?: boolean }) => { for (const fn of listeners) fn(e); if (!e.stopped) reached.push(e.key); } };
  const page = {
    document: { querySelector: () => null, body },
    addEventListener: (t: string, fn: (e: unknown) => void) => { if (t === 'keydown') listeners.push(fn); },
    removeEventListener: () => { listeners.length = 0; },
  };
  const press = (key: string) => {
    const e = { key, target: body, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, stopped: false, preventDefault() {}, stopImmediatePropagation() { this.stopped = true; } };
    for (const fn of listeners) { fn(e); if (e.stopped) break; }
    if (!e.stopped) reached.push(key);
  };
  beforeEach(() => {
    vi.useFakeTimers();
    reached.length = 0;
    strayLetters.reset();
    now = 50_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    off = installStrayLetters(page as unknown as Window, ((e: object) => ({ ...e, stopped: false, preventDefault() {}, stopImmediatePropagation() { (this as { stopped: boolean }).stopped = true; } })) as never);
  });
  afterEach(() => { off?.(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it('reach the app as one Z, not as nothing', () => {
    press('z');
    now += 80; vi.advanceTimersByTime(80);
    press('z');
    now += BURST_MS + 10; vi.advanceTimersByTime(BURST_MS + 10);
    expect(reached).toEqual(['z']);
  });

  it('but a Z that starts a word still runs nothing', () => {
    for (const k of 'zzqqxx') { press(k); now += 20; vi.advanceTimersByTime(20); }
    now += 1000; vi.advanceTimersByTime(1000);
    expect(reached).toEqual([]);
  });
});
