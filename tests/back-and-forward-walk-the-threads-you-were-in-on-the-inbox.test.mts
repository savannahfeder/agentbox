// BACK AND FORWARD WALK THE THREADS YOU WERE IN, AND ONLY ON THE INBOX.
//
// What broke: the arrows walked every page you had been on, so on the inbox
// "I keep having to hit back, back, and it goes back and forth between the
// pages I was on without actually going back to the thread I was on and then
// the one before". Measured in the built renderer with ⌘[: two threads opened
// from Needs you, then Files, then the inbox; six presses landed on Files, the
// second thread, the list, the first thread, the list, and Home.
//
// The trail (renderer/src/back-and-forward.ts) now holds threads only, and the
// arrows are drawn on the inbox page alone: its list and a thread opened there.

import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { arrive, stepBack, stepForward, sameStop, settledPlaces, stopOnScreen, onInboxPage, EMPTY_TRAIL, SETTLE_MS, TRAIL_LIMIT, type Screen, type Stop, type Trail } from '../renderer/src/back-and-forward';
import { alphaFeatures } from '../main/settings.mts';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => fs.readFileSync(path.join(here, '..', rel), 'utf8');

const thread = (id: string): Stop => ({ at: 'thread', product: 'p', id });
const card = (id: string): Stop => ({ at: 'card', person: 'm', thread: id });
const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(thread);
// Every thread opened by hand, in order. The list between them records nothing.
const walk = (...stops: Stop[]) => stops.reduce((t: Trail, s) => arrive(t, s), EMPTY_TRAIL);
// Presses back or forward `n` times from `on` (the thread on screen, or null
// for the list) and says where each press landed.
const press = (by: 'back' | 'forward', n: number, t: Trail, on: Stop | null) => {
  const landed: Stop[] = [];
  for (let i = 0; i < n; i++) {
    const next = (by === 'back' ? stepBack : stepForward)(t, on);
    if (!next) break;
    landed.push(next.stop);
    t = next.trail;
    on = next.stop;
  }
  return { landed, trail: t };
};

describe('back', () => {
  it('from a thread goes to the thread you were in before it, then the one before that', () => {
    expect(press('back', 5, walk(a, b, c), c).landed).toEqual([b, a]);
  });

  it('from the list goes first to the thread you just left', () => {
    expect(press('back', 5, walk(a, b, c), null).landed).toEqual([c, b, a]);
  });

  it('treats two threads visited in turn as two steps, not a back and forth', () => {
    expect(press('back', 5, walk(a, b, a, b), b).landed).toEqual([a]);
  });

  it('takes a thread you opened again from where it was to the newest place', () => {
    expect(press('back', 5, walk(a, b, c, a), a).landed).toEqual([c, b]);
  });

  it('from a thread just opened and not yet counted goes to the one you came from', () => {
    expect(stepBack(walk(a, b), d)!.stop).toEqual(b);
  });

  it('skips a thread that is gone, such as a deleted one', () => {
    const gone = (s: Stop) => !(s.at === 'thread' && s.id === 'gone');
    const t = walk(a, thread('gone'), b);
    expect(stepBack(t, b, gone)!.stop).toEqual(a);
    expect(stepBack(walk(a, thread('gone')), null, gone)!.stop).toEqual(a);
    expect(stepBack(walk(thread('gone')), null, gone)).toBeNull();
  });
});

describe('forward', () => {
  it('walks the threads back passed, in order', () => {
    const { trail } = press('back', 2, walk(a, b, c), c);
    expect(press('forward', 5, trail, a).landed).toEqual([b, c]);
  });

  it('from the list goes to the thread after the one you left', () => {
    const { trail } = press('back', 1, walk(a, b, c), c);
    expect(stepForward(trail, null)!.stop).toEqual(c);
    expect(stepBack(trail, null)!.stop).toEqual(b);
  });

  it('is gone once a new thread is opened after going back', () => {
    const { trail } = press('back', 1, walk(a, b, c), c);
    expect(stepForward(trail, d)).toBeNull();
    const next = arrive(trail, d);
    expect(next.stops).toEqual([a, b, d]);
    expect(stepForward(next, d)).toBeNull();
  });
});

describe('the trail', () => {
  it('has nowhere to go at either end', () => {
    expect(stepBack(EMPTY_TRAIL, null)).toBeNull();
    expect(stepForward(EMPTY_TRAIL, null)).toBeNull();
    expect(stepBack(walk(a), a)).toBeNull();
    expect(stepForward(walk(a, b), b)).toBeNull();
    expect(stepForward(walk(a, b), null)).toBeNull();
  });

  it('never holds the same thread twice in a row', () => {
    expect(walk(a, a, b, b).stops).toEqual([a, b]);
  });

  it('keeps the newest threads when it is long', () => {
    let t = EMPTY_TRAIL;
    for (let i = 0; i < TRAIL_LIMIT + 10; i++) t = arrive(t, thread(String(i)));
    expect(t.stops.length).toBe(TRAIL_LIMIT);
    expect(t.stops[t.stops.length - 1]).toEqual(thread(String(TRAIL_LIMIT + 9)));
    expect(t.at).toBe(TRAIL_LIMIT - 1);
  });

  it("holds a teammate's thread opened from the inbox as one of the threads", () => {
    expect(press('back', 5, walk(a, card('x'), b), b).landed).toEqual([card('x'), a]);
  });

  it("tells threads apart by project, and a teammate's thread from your own", () => {
    expect(sameStop(a, b)).toBe(false);
    expect(sameStop(a, { at: 'thread', product: 'q', id: 'a' })).toBe(false);
    expect(sameStop(a, card('a'))).toBe(false);
    expect(sameStop(card('x'), { at: 'card', person: 'n', thread: 'x' })).toBe(false);
    expect(sameStop(a, thread('a'))).toBe(true);
    expect(sameStop(card('x'), card('x'))).toBe(true);
  });
});

describe('the arrows are on the inbox page alone', () => {
  const screen = (over: Partial<Screen> = {}): Screen => ({ thread: null, card: null, inbox: false, ...over });

  it("are on its list, a thread opened there, and a teammate's thread opened from it", () => {
    expect(onInboxPage(screen({ inbox: true }))).toBe(true);
    expect(onInboxPage(screen({ thread: { product: 'p', id: 'a' } }))).toBe(true);
    expect(onInboxPage(screen({ card: { person: 'm', thread: 'x' } }))).toBe(true);
  });

  it('are off on every other page', () => {
    expect(onInboxPage(screen())).toBe(false);
  });

  it('record the thread on screen, and nothing for the list', () => {
    expect(stopOnScreen(screen({ inbox: true }))).toBeNull();
    expect(stopOnScreen(screen({ thread: { product: 'p', id: 'a' } }))).toEqual(a);
    expect(stopOnScreen(screen({ card: { person: 'm', thread: 'x' } }))).toEqual(card('x'));
  });
});

describe('what the app hands the arrows', () => {
  const app = read('renderer/src/App.tsx');
  const field = (name: string) => {
    const at = app.indexOf(`const screenHere: TrailScreen = {`);
    const body = app.slice(at, app.indexOf('\n  };', at));
    return body.slice(body.indexOf(`${name}:`)).split('\n')[0];
  };

  it('counts a thread of yours unless its own back leads off the inbox: to Chats, the Team page or a group', () => {
    expect(field('thread')).toContain('focused && !settingsOpen && !inChats && !teamOpen && !(directOpen && roomsUi.openId)');
  });

  it("counts a teammate's thread only when its back leads to the inbox", () => {
    expect(field('card')).toContain('openCard && onTeammateThread && !roomsUi.roomName');
  });

  it('counts the inbox in any tab, and not Home, Files, Connections, Settings, the Team page, a group or a teammate', () => {
    const inbox = field('inbox');
    for (const page of ['focused', 'settingsOpen', 'teamShown', 'homeHere', 'filesShown', 'connectionsShown', 'roomShown', 'teammatesShown', 'chatsPlaceShown']) {
      expect(inbox).toContain(`!${page}`);
    }
    expect(inbox).not.toMatch(/view ===|search/);
  });

  it('draws the arrows only there', () => {
    expect(app).toMatch(/const backForward = backForwardOn && onInboxPage\(screenHere\)\n/);
    expect(app).toMatch(/useBackAndForward\(\{\n\s*on: backForwardOn,\n\s*inbox: onInboxPage\(screenHere\),\n\s*here: stopOnScreen\(screenHere\),/);
  });

  it('opens a thread the arrows reach over the inbox, so its own back still says Inbox', () => {
    const go = app.slice(app.indexOf('go: (s) => {'), app.indexOf('const stopName'));
    expect(go).toMatch(/if \(card\) \{ openView\(view\); openTeammateCard\(card\); \}/);
    expect(go).toMatch(/if \(item\) \{ openView\(view\); setFocused\(item\); \}/);
  });

  // Their header pulls a list column to the card edge, which the arrows
  // used to sit over.
  it('leaves Chats, Groups and a teammate\'s page their own column header, with nothing pulled for arrows', () => {
    const css = read('renderer/src/styles.css');
    expect(css).not.toMatch(/back-forward \+ \.gc-head|--bf-w/);
    expect(read('renderer/src/team/rooms/rooms.css')).toMatch(/\.gc-head \{[^}]*margin-left: -32px/);
  });

  it('gives Settings and Home no arrows to make room for, and Settings its own back again', () => {
    const css = read('renderer/src/styles.css');
    expect(css).not.toMatch(/\.app\.home-shown > \.topbar \.back-forward|\.app\.back-forward-on \.workspace-page-heading/);
    expect(app).toMatch(/<button className="workspace-back" aria-label="Back to previous page"/);
  });
});

describe('the keys', () => {
  const hook = read('renderer/src/back-and-forward.ts');

  it('walk the trail with ⌘[ and ⌘] (Ctrl off a Mac) and the side buttons', () => {
    expect(hook).toMatch(/'\['/);
    expect(hook).toMatch(/'\]'/);
    expect(hook).toMatch(/e\.button !== 3 && e\.button !== 4/);
  });

  // In a browser ⌘[ is the tab's own Back, which would leave the app.
  it('are held on every page of a computer, and step only on the inbox', () => {
    expect(hook).toMatch(/useEffect\(\(\) => \{\n\s*if \(!on\) return;\n\s*const onKey = /);
    expect(hook).toMatch(/\}, \[on, back, forward\]\);/);
    expect(hook).toMatch(/const travel = useCallback\(\(by: 1 \| -1\) => \{\n\s*const \{ walking, here, exists, go \} = live\.current;\n\s*if \(!walking\) return;/);
  });
});

// Closing a thread with E passes through the list for a moment on its way to
// the next thread, and a thread can flash past on the way to another.
describe('a thread counts once it stays on screen', () => {
  const recorded = () => {
    const seen: Stop[] = [];
    return { seen, rec: settledPlaces((s) => seen.push(s)) };
  };
  afterEach(() => { vi.useRealTimers(); });

  it('skips a thread that flashed past on the way to the next one', () => {
    vi.useFakeTimers();
    const { seen, rec } = recorded();
    rec.see(a); vi.advanceTimersByTime(SETTLE_MS + 1);
    rec.see(b); vi.advanceTimersByTime(20);
    rec.see(c); vi.advanceTimersByTime(SETTLE_MS + 1);
    expect(seen).toEqual([a, c]);
  });

  it('records a thread you stayed on, however briefly you stayed after', () => {
    vi.useFakeTimers();
    const { seen, rec } = recorded();
    rec.see(a); vi.advanceTimersByTime(SETTLE_MS + 1);
    rec.see(b); vi.advanceTimersByTime(SETTLE_MS + 1);
    expect(seen).toEqual([a, b]);
  });

  it('records nothing for a thread left for the list before it settled', () => {
    vi.useFakeTimers();
    const { seen, rec } = recorded();
    rec.see(a); rec.stop(); vi.advanceTimersByTime(SETTLE_MS * 2);
    expect(seen).toEqual([]);
  });
});

// It left Alpha features on 2026-11-10: "we are good to remove 'this is an
// alpha feature' and we're just going to build it into the main app itself".
describe('the arrows are part of the app', () => {
  it('have no switch, in a checkout or the downloaded app', () => {
    expect(alphaFeatures({}, { packaged: true })).not.toHaveProperty('backForward');
    expect(alphaFeatures({ alphaBackForward: false }, { packaged: false })).not.toHaveProperty('backForward');
    expect(read('renderer/src/components/Settings.tsx')).not.toMatch(/alphaBackForward|label="Back and forward"/);
    expect(read('main/settings.mts')).not.toMatch(/alphaBackForward/);
  });

  it('are on on a computer and off on a phone', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).toMatch(/const backForwardOn = !onPhone\(\);/);
    expect(app).not.toMatch(/alpha\?\.backForward/);
  });
});
