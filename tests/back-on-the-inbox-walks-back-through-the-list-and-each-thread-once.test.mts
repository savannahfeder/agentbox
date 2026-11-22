// BACK ON THE INBOX WALKS BACK THROUGH THE LIST AND EACH THREAD ONCE.
//
// What broke, in two rounds. The arrows walked every page: "I keep having to
// hit back, back, and it goes back and forth between the pages I was on". They
// are on the inbox page alone now. The first fix then left the list out of the
// walk, and the list is where Back is pressed to get to: "Sometimes I'll hit
// Back to try to go to that main page again." What was really wrong was memory:
// "I would go back three steps and it would just go between the same step over
// and over again". Measured by replaying visits through main's trail: two
// threads each opened from the list twice, then seven presses of back, landed
// list, A, list, B, list, A, list.
//
// The trail (renderer/src/back-and-forward.ts) now holds the list and each
// thread once, where you were in it last, so the same visits walk back list,
// A, list and stop.

import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { arrive, land, settle, stepBack, stepForward, sameStop, samePlace, settledPlaces, stopOnScreen, onInboxPage, EMPTY_TRAIL, SETTLE_MS, TRAIL_LIMIT, type Screen, type Stop, type Trail } from '../renderer/src/back-and-forward';
import type { View } from '../renderer/src/types';
import { alphaFeatures } from '../main/settings.mts';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => fs.readFileSync(path.join(here, '..', rel), 'utf8');

const list = (view: View = 'inbox'): Stop => ({ at: 'list', view });
const thread = (id: string): Stop => ({ at: 'thread', product: 'p', id });
const card = (id: string): Stop => ({ at: 'card', person: 'm', thread: id });
const chat = (id: string): Stop => ({ at: 'group', id });
const L = list();
const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(thread);
// Every place you went to by hand, in order, each staying long enough to count.
const walk = (...stops: Stop[]) => stops.reduce((t: Trail, s) => arrive(t, s), EMPTY_TRAIL);
// Presses back or forward `n` times from `on`, the place on screen, and says
// where each press landed.
const press = (by: 'back' | 'forward', n: number, t: Trail, on: Stop | null) => {
  const landed: Stop[] = [];
  for (let i = 0; i < n; i++) {
    const next = (by === 'back' ? stepBack : stepForward)(t, on);
    if (!next) break;
    landed.push(next.stop);
    t = next.trail;
    on = next.stop;
  }
  return { landed, trail: t, on };
};

describe('back from a thread', () => {
  it('goes to the list it was opened from, the main page', () => {
    expect(press('back', 5, walk(L, a), a).landed).toEqual([L]);
  });

  it('then to the thread before it, and so on back to where you started', () => {
    expect(press('back', 9, walk(L, a, L, b, L, c), c).landed).toEqual([L, b, L, a, L]);
  });
});

describe('back never goes round in circles', () => {
  it('walks two threads each opened from the list twice as one step each', () => {
    expect(press('back', 9, walk(L, a, L, b, L, a, L, b), b).landed).toEqual([L, a, L]);
  });

  it('walks a thread checked three times as one step', () => {
    expect(press('back', 9, walk(L, a, L, a, L, a), a).landed).toEqual([L]);
  });

  it('walks two threads stepped between in the thread view as one step each', () => {
    expect(press('back', 9, walk(L, a, b, a, b), b).landed).toEqual([a, L]);
  });

  it('remembers a thread opened again where you opened it last', () => {
    expect(press('back', 9, walk(L, a, L, b, L, c, L, a), a).landed).toEqual([L, c, L, b, L]);
  });

  // Hundreds of made-up sessions: whatever was opened, in whatever order,
  // walking back shows each thread once and never stands still.
  it('holds for any order of visits, backs and forwards', () => {
    let seed = 7;
    const random = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    const places = [a, b, c, d, card('x'), chat('g'), L, L, list('progress'), list('done')];
    for (let run = 0; run < 400; run++) {
      let t = EMPTY_TRAIL;
      let on: Stop = L;
      t = arrive(t, on);
      for (let move = 0; move < 30; move++) {
        const pick = random(14);
        if (pick < places.length) { on = places[pick]; t = arrive(t, on); }
        else {
          const next = pick % 2 ? stepBack(t, on) : stepForward(t, on);
          if (next) { t = next.trail; on = next.stop; }
        }
        const kept = t.stops.filter((s) => s.at !== 'list');
        expect(kept.every((s, i) => kept.findIndex((o) => sameStop(o, s)) === i)).toBe(true);
        expect(t.stops.every((s, i) => !(s.at === 'list' && t.stops[i + 1]?.at === 'list'))).toBe(true);
        expect(samePlace(t.stops[t.at], on)).toBe(true);
        const { landed } = press('back', 99, t, on);
        let was = on;
        for (const s of landed) { expect(samePlace(s, was)).toBe(false); was = s; }
        const threads = landed.filter((s) => s.at !== 'list');
        expect(threads.every((s, i) => threads.findIndex((o) => sameStop(o, s)) === i)).toBe(true);
      }
    }
  });
});

describe('the list', () => {
  it('is where back from the list goes first: the thread you just left', () => {
    expect(stepBack(walk(L, a, L), L)!.stop).toEqual(a);
  });

  it('keeps the tab you picked on it, as one step rather than one per tab', () => {
    const t = walk(L, list('progress'), list('done'), a);
    expect(t.stops).toEqual([list('done'), a]);
    expect(press('back', 5, t, a).landed).toEqual([list('done')]);
  });

  it('is the same place in any tab, so back from it is never a step to another tab', () => {
    expect(samePlace(list('inbox'), list('progress'))).toBe(true);
    expect(sameStop(list('inbox'), list('progress'))).toBe(false);
    expect(stepBack(walk(L, a, L), list('progress'))!.stop).toEqual(a);
  });
});

describe('forward', () => {
  it('walks back the way back came', () => {
    const back = press('back', 3, walk(L, a, L, b, L, c), c);
    expect(back.landed).toEqual([L, b, L]);
    expect(press('forward', 9, back.trail, back.on).landed).toEqual([b, L, c]);
  });

  it('still goes on after Esc from a thread back took you to', () => {
    const back = press('back', 4, walk(L, a, L, b, L, c), c);
    expect(back.on).toEqual(a);
    const esc = arrive(back.trail, L);
    expect(press('forward', 9, esc, L).landed).toEqual([b, L, c]);
  });

  it('is gone once you open somewhere new after going back', () => {
    const back = press('back', 2, walk(L, a, L, b, L, c), c);
    const next = arrive(back.trail, d);
    expect(next.stops).toEqual([L, a, L, b, d]);
    expect(stepForward(next, d)).toBeNull();
  });

  it('has nothing ahead of a place that has not counted yet', () => {
    expect(stepForward(walk(L, a, L, b), d)).toBeNull();
  });
});

describe('the trail', () => {
  it('has nowhere to go at either end', () => {
    expect(stepBack(EMPTY_TRAIL, L)).toBeNull();
    expect(stepForward(EMPTY_TRAIL, L)).toBeNull();
    expect(stepBack(walk(L), L)).toBeNull();
    expect(stepForward(walk(L, a), a)).toBeNull();
  });

  it('goes back from a thread just opened, before it counts, to where you were', () => {
    expect(stepBack(walk(L, a, L), d)!.stop).toEqual(L);
  });

  it('skips a thread that is gone, and a list it would leave you on twice', () => {
    const gone = (s: Stop) => !(s.at === 'thread' && s.id === 'a');
    expect(press('back', 9, walk(L, a, L, b), b).landed).toEqual([L, a, L]);
    const landed: Stop[] = [];
    let t = walk(L, a, L, b);
    let on: Stop = b;
    for (let next = stepBack(t, on, gone); next; next = stepBack(t, on, gone)) { landed.push(next.stop); t = next.trail; on = next.stop; }
    expect(landed).toEqual([L]);
  });

  it('keeps the newest places when it is long', () => {
    let t = EMPTY_TRAIL;
    for (let i = 0; i < TRAIL_LIMIT; i++) t = arrive(arrive(t, L), thread(String(i)));
    expect(t.stops.length).toBe(TRAIL_LIMIT);
    expect(t.stops[t.stops.length - 1]).toEqual(thread(String(TRAIL_LIMIT - 1)));
    expect(t.at).toBe(TRAIL_LIMIT - 1);
  });

  it("holds a teammate's thread and a chat opened from the inbox as threads", () => {
    expect(press('back', 9, walk(L, card('x'), L, chat('g'), b), b).landed).toEqual([chat('g'), L, card('x'), L]);
  });

  it("tells places apart by project, and a teammate's thread and a chat from your own", () => {
    expect(sameStop(a, b)).toBe(false);
    expect(sameStop(a, { at: 'thread', product: 'q', id: 'a' })).toBe(false);
    expect(sameStop(a, card('a'))).toBe(false);
    expect(sameStop(chat('a'), a)).toBe(false);
    expect(sameStop(card('x'), { at: 'card', person: 'n', thread: 'x' })).toBe(false);
    expect(sameStop(a, thread('a'))).toBe(true);
    expect(sameStop(chat('g'), chat('g'))).toBe(true);
    expect(samePlace(L, a)).toBe(false);
  });
});

// A step opens its place, and once that has stayed on screen it is not a new
// visit. One that showed somewhere else instead takes that place on the trail
// rather than starting a new way from it, which is how the old trail could
// lose what was ahead and send the next back to where you had just been.
describe('a step that has landed', () => {
  const t = press('back', 1, walk(L, a, L, b), b).trail;

  it('is not a new visit once its own place has stayed on screen', () => {
    expect(settle(t, L, { to: L, reached: true })).toBe(t);
  });

  it('takes the place it landed on instead, and keeps the way forward', () => {
    const landed = settle(t, list('progress'), { to: L, reached: false });
    expect(landed).toEqual(land(t, list('progress')));
    expect(landed.stops).toEqual([L, a, list('progress'), b]);
    expect(stepForward(landed, list('progress'))!.stop).toEqual(b);
  });

  it('is a new visit when you moved on from it before it counted', () => {
    expect(settle(t, d, { to: L, reached: true })).toEqual(arrive(t, d));
  });

  it('is an ordinary visit when no step was taken', () => {
    expect(settle(t, d, null)).toEqual(arrive(t, d));
  });
});

describe('the arrows are on the inbox page alone', () => {
  const screen = (over: Partial<Screen> = {}): Screen => ({ thread: null, card: null, group: null, list: null, ...over });

  it("are on its list, a thread opened there, a teammate's thread and a chat opened from it", () => {
    expect(onInboxPage(screen({ list: 'inbox' }))).toBe(true);
    expect(onInboxPage(screen({ thread: { product: 'p', id: 'a' } }))).toBe(true);
    expect(onInboxPage(screen({ card: { person: 'm', thread: 'x' } }))).toBe(true);
    expect(onInboxPage(screen({ group: 'g' }))).toBe(true);
  });

  it('are off on every other page', () => {
    expect(onInboxPage(screen())).toBe(false);
    expect(stopOnScreen(screen())).toBeNull();
  });

  it('record what is on screen, the list with its tab', () => {
    expect(stopOnScreen(screen({ list: 'progress' }))).toEqual(list('progress'));
    expect(stopOnScreen(screen({ thread: { product: 'p', id: 'a' } }))).toEqual(a);
    expect(stopOnScreen(screen({ card: { person: 'm', thread: 'x' } }))).toEqual(card('x'));
    expect(stopOnScreen(screen({ group: 'g' }))).toEqual(chat('g'));
  });
});

describe('what the app hands the arrows', () => {
  const app = read('renderer/src/App.tsx');
  const field = (name: string) => {
    const at = app.indexOf('const screenHere: TrailScreen = {');
    const body = app.slice(at, app.indexOf('\n  };', at));
    return body.slice(body.indexOf(`\n    ${name}:`)).split('\n')[1];
  };
  const go = app.slice(app.indexOf('    go: (s) => {'), app.indexOf('const threadName = '));

  it('counts a thread of yours unless its own back leads off the inbox: to Chats, the Team page or a group', () => {
    expect(field('thread')).toContain('focused && !settingsOpen && !inChats && !teamOpen && !(directOpen && roomsUi.openId)');
  });

  it("counts a teammate's thread only when its back leads to the inbox", () => {
    expect(field('card')).toContain('openCard && onTeammateThread && !roomsUi.roomName');
  });

  it('counts the list in any tab, and not Home, Files, Connections, Settings, the Team page, a group or a teammate', () => {
    const shown = field('list');
    for (const page of ['focused', 'settingsOpen', 'teamShown', 'homeHere', 'filesShown', 'connectionsShown', 'roomShown', 'teammatesShown', 'chatsPlaceShown']) {
      expect(shown).toContain(`!${page}`);
    }
    expect(shown).toMatch(/\? view : null,$/);
  });

  it('draws the arrows only there', () => {
    expect(app).toMatch(/const backForward = backForwardOn && onInboxPage\(screenHere\)\n/);
    expect(app).toMatch(/useBackAndForward\(\{\n\s*on: backForwardOn,\n\s*inbox: onInboxPage\(screenHere\),\n\s*here: stopOnScreen\(screenHere\),/);
  });

  it('goes back to the list as Esc does, keeping its tab, or opens the tab it was on', () => {
    expect(go).toMatch(/if \(s\.at === 'list'\) \{\n\s*if \(s\.view !== view\) openView\(s\.view\);\n\s*else \{ roomsUi\.leave\(\); setOpenCard\(null\); setTeamOpen\(false\); setFocused\(null\); \}/);
  });

  it('opens a thread the arrows reach over the inbox, so its own back still says Inbox', () => {
    expect(go).toMatch(/if \(card\) \{ openView\(view\); openTeammateCard\(card\); \}/);
    expect(go).toMatch(/if \(item\) \{ openView\(view\); setFocused\(item\); \}/);
  });

  it('names the list by its tab', () => {
    expect(app).toContain("const stopName = (s: TrailStop): string => s.at === 'list' ? (INBOX_TABS.find((t) => t.view === s.view)?.label ?? 'Inbox')");
  });

  // Their header pulls a list column to the card edge, which the arrows
  // used to sit over.
  it("leaves Chats, Groups and a teammate's page their own column header, with nothing pulled for arrows", () => {
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

  it('mark a step reached once its place is on screen, and forget it off the inbox', () => {
    expect(hook).toMatch(/stepping\.current = \{ to: next\.stop, reached: false \};/);
    expect(hook).toMatch(/if \(!walking \|\| !here\) \{ recorder\.current\?\.stop\(\); stepping\.current = null; return; \}/);
    expect(hook).toMatch(/if \(step && !step\.reached && sameStop\(step\.to, here\)\) step\.reached = true;/);
    expect(hook).toMatch(/setTrail\(\(t\) => settle\(t, s, step\)\);/);
  });
});

// Closing a thread with E passes through the list for a moment on its way to
// the next thread, and a thread can flash past on the way to another.
describe('a place counts once it stays on screen', () => {
  const recorded = () => {
    const seen: Stop[] = [];
    return { seen, rec: settledPlaces((s) => seen.push(s)) };
  };
  afterEach(() => { vi.useRealTimers(); });

  it('skips the list a closing thread passes through on its way to the next one', () => {
    vi.useFakeTimers();
    const { seen, rec } = recorded();
    rec.see(a); vi.advanceTimersByTime(SETTLE_MS + 1);
    rec.see(L); vi.advanceTimersByTime(20);
    rec.see(b); vi.advanceTimersByTime(SETTLE_MS + 1);
    expect(seen).toEqual([a, b]);
  });

  it('records a place you stayed on, however briefly you stayed after', () => {
    vi.useFakeTimers();
    const { seen, rec } = recorded();
    rec.see(a); vi.advanceTimersByTime(SETTLE_MS + 1);
    rec.see(L); vi.advanceTimersByTime(SETTLE_MS + 1);
    expect(seen).toEqual([a, L]);
  });

  it('records nothing for a place left for another page before it settled', () => {
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
