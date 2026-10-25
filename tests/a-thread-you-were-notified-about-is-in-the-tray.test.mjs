// A NOTIFICATION CAME AND THE TRAY STAYED AWAY (w-93b3a1a796). Reported: "I
// just got a notification. The agent tray did not come up... When I get a
// notification and I'm in a different tab, you would think the agent tray
// would immediately be visible."
//
// The two decided "new" differently. The banner speaks for anything that newly
// joins Needs you while you are not at the app, and "not at the app" includes
// Agentbox in front with nobody touching the computer for five minutes. The
// tray counted only what an answer or a status had dated after you last left
// the window. So two kinds of arrival got a banner and no tray:
// - Away with Agentbox in front: leaving it afterwards counted as having looked
//   at everything that arrived while you were gone.
// - A thread joining Needs you with no new answer: back from Later, stalled, or
//   the thread it waited on finished. Its date is its old answer.
// Read from the store on 2026-10-23: the tray's last-left time was 20:04:12 and
// several threads joined Needs you with answers dated minutes before it.
//
// Now whatever a banner has told you about, until you come back to the app, is
// in the tray, dated from when it told you.
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newSince } from '../shared/corner-tag.mjs';
import { AWAY_AFTER_MS } from '../shared/notify-rules.mjs';
import { createNotifier } from '../main/notify.mjs';
import { cornerTagRig } from './helpers/corner-tag-rig.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const minute = 60_000;
const hour = 60 * minute;

function fakeNotifications() {
  const shown = [];
  class N {
    constructor(opts) { this.opts = opts; this.handlers = {}; }
    on(event, fn) { this.handlers[event] = fn; return this; }
    show() { shown.push(this); }
    close() { this.handlers.close?.(); }
  }
  N.isSupported = () => true;
  return { N, shown };
}
const fakeWindow = (focused = false) => ({
  focusedNow: focused,
  isDestroyed: () => false,
  isFocused() { return this.focusedNow; },
  isMinimized: () => false, restore() {}, show() {}, focus() {},
  webContents: { send() {} },
});
const idleFor = (box) => ({ getSystemIdleTime: () => box.ms / 1000 });
const item = (id) => ({ id, title: id, productName: 'Agentbox', kind: 'item' });

describe('the banner keeps what it told you about until you are back', () => {
  it('lists what it told you while you were in another app, with when', () => {
    vi.useFakeTimers({ now: 5_000_000 });
    const { N, shown } = fakeNotifications();
    const changed = vi.fn();
    const n = createNotifier({ window: fakeWindow(false), Notification: N, powerMonitor: idleFor({ ms: 0 }), onChange: changed });
    n.add([item('w-1')]);
    vi.advanceTimersByTime(2000);
    expect(shown).toHaveLength(1);
    expect(n.told()).toEqual([{ id: 'w-1', at: 5_000_000 }]);
    expect(changed).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('counts Agentbox in front with nobody at the computer as away', () => {
    vi.useFakeTimers({ now: 5_000_000 });
    const { N } = fakeNotifications();
    const n = createNotifier({ window: fakeWindow(true), Notification: N, powerMonitor: idleFor({ ms: AWAY_AFTER_MS + 1 }) });
    n.add([item('w-2')]);
    expect(n.told().map((t) => t.id)).toEqual(['w-2']);
    vi.useRealTimers();
  });

  it('keeps nothing that arrived while you were at the app', () => {
    const { N } = fakeNotifications();
    const n = createNotifier({ window: fakeWindow(true), Notification: N, powerMonitor: idleFor({ ms: AWAY_AFTER_MS - 1 }) });
    n.add([item('w-3')]);
    expect(n.told()).toEqual([]);
  });

  it('lets go of it all when you come back, and says so', () => {
    const { N } = fakeNotifications();
    const changed = vi.fn();
    const n = createNotifier({ window: fakeWindow(false), Notification: N, powerMonitor: idleFor({ ms: 0 }), onChange: changed });
    n.add([item('w-4')]);
    changed.mockClear();
    n.seen();
    expect(n.told()).toEqual([]);
    expect(changed).toHaveBeenCalledTimes(1);
    // Coming back with nothing told is not news.
    n.seen();
    expect(changed).toHaveBeenCalledTimes(1);
  });
});

describe('what counts as new, with what you were told', () => {
  const looked = Date.UTC(2026, 9, 23, 20, 4, 12);

  it('counts a thread you were told about though its answer is older than your last look', () => {
    const ready = [{ id: 'back-from-later', since: looked - 3 * hour }];
    expect(newSince(ready, looked, [{ id: 'back-from-later', at: looked + minute }])).toEqual([
      { id: 'back-from-later', since: looked + minute },
    ]);
  });

  it('keeps a thread\'s own moment when it is the later one', () => {
    const ready = [{ id: 'w-1', since: looked + 5 * minute }];
    expect(newSince(ready, looked, [{ id: 'w-1', at: looked + minute }])).toEqual(ready);
  });

  it('does not count a thread you were told about that has since left Needs you', () => {
    expect(newSince([], looked, [{ id: 'gone', at: looked + minute }])).toEqual([]);
  });

  it('still counts nothing old that you were not told about', () => {
    const ready = [{ id: 'old', since: looked - minute }, { id: 'told', since: looked - hour }];
    expect(newSince(ready, looked, [{ id: 'told', at: looked + 1 }]).map((r) => r.id)).toEqual(['told']);
  });
});

const T = 1_000_000_000;
const waiting = (since, id) => ({ id, title: id, says: 'is ready for you', since });

describe('the tray comes up for whatever the banner told you', () => {
  it('shows what arrived while you were away with Agentbox in front, after you leave it', () => {
    const told = [];
    const r = cornerTagRig({ at: T, focused: true, told: () => told });
    // Away from the desk with Agentbox in front: an agent finishes and the
    // banner speaks.
    r.advance(20 * minute);
    r.hand({ ready: [waiting(r.clock(), 'finished')], working: 2 });
    told.push({ id: 'finished', at: r.clock() });
    // Back, and straight to another app.
    r.advance(10 * minute);
    r.leaveApp();
    r.tag.refresh();
    r.pageUp();
    expect(r.win().visible).toBe(true);
    expect(r.lastState().ready.map((x) => x.id)).toEqual(['finished']);
  });

  it('shows a thread back from Later the moment the banner names it', () => {
    const told = [];
    const r = cornerTagRig({ at: T, focused: true, told: () => told });
    r.leaveApp();
    r.advance(30 * minute);
    r.hand({ ready: [waiting(T - 2 * hour, 'later')], working: 0 });
    expect(r.windows).toHaveLength(0);
    told.push({ id: 'later', at: r.clock() });
    r.tag.refresh();
    r.pageUp();
    expect(r.win().visible).toBe(true);
    expect(r.lastState().ready).toEqual([expect.objectContaining({ id: 'later', since: r.clock() })]);
  });

  it('is gone again once you have been back to the app', () => {
    let told = [{ id: 'later', at: T + minute }];
    const r = cornerTagRig({ at: T, told: () => told, config: { cornerTagLookedAt: T } });
    r.advance(2 * minute);
    r.hand({ ready: [waiting(T - hour, 'later')], working: 0 });
    r.pageUp();
    expect(r.win().visible).toBe(true);
    r.enterApp();
    told = [];
    r.leaveApp();
    r.tag.refresh();
    expect(r.win().visible).toBe(false);
  });

  it('stays away when the banner told you nothing and nothing is new', () => {
    const r = cornerTagRig({ at: T, told: () => [], config: { cornerTagLookedAt: T } });
    r.hand({ ready: [waiting(T - hour, 'old')], working: 3 });
    expect(r.windows).toHaveLength(0);
  });

  it('is handed what the banner told, and the banner wakes the tray when that changes', () => {
    const main = fs.readFileSync(path.join(root, 'main/main.mjs'), 'utf8');
    expect(main).toMatch(/told: \(\) => notifier\.told\(\)/);
    expect(main).toMatch(/onChange: \(\) => cornerTag\?\.refresh\(\)/);
  });
});
