// BACK AND FORWARD RETRACE THE PLACES YOU VISITED.
//
// What was missing: "i quite often finding myself wanting to go back to the
// previous place i was", mostly after leaving a thread for the inbox or
// another page. The only arrow in the app went up to a thread's tab, never
// back to where you had been, so a thread you had just left was lost in the
// list. Measured by reading App.tsx: no ⌘[ handler, no record of past places.
//
// The trail (renderer/src/back-and-forward.ts) is what the arrows, ⌘[ and ⌘]
// walk. These are the cases that decide whether it lands where you expect.

import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { arrive, stepBack, stepForward, sameStop, settledPlaces, EMPTY_TRAIL, SETTLE_MS, TRAIL_LIMIT, type Stop, type Trail } from '../renderer/src/back-and-forward';
import { alphaFeatures } from '../main/settings.mts';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => fs.readFileSync(path.join(here, '..', rel), 'utf8');

const inbox: Stop = { at: 'list', view: 'inbox' };
const home: Stop = { at: 'home' };
const files: Stop = { at: 'files', project: null };
const thread = (id: string): Stop => ({ at: 'thread', product: 'p', id });
const walk = (...stops: Stop[]) => stops.reduce((t: Trail, s) => arrive(t, s), EMPTY_TRAIL);

describe('the trail', () => {
  it('goes back to the thread you just left, and forward again', () => {
    const t = walk(inbox, thread('a'), inbox);
    const back = stepBack(t)!;
    expect(back.stop).toEqual(thread('a'));
    const fwd = stepForward(back.trail)!;
    expect(fwd.stop).toEqual(inbox);
  });

  it('goes back a couple of steps', () => {
    let t = walk(home, thread('a'), files, inbox);
    const one = stepBack(t)!; t = one.trail;
    const two = stepBack(t)!; t = two.trail;
    expect([one.stop, two.stop]).toEqual([files, thread('a')]);
    expect(stepBack(stepBack(t)!.trail)).toBeNull();
  });

  it('has nowhere to go at either end', () => {
    expect(stepBack(EMPTY_TRAIL)).toBeNull();
    expect(stepBack(walk(inbox))).toBeNull();
    expect(stepForward(walk(inbox, home))).toBeNull();
  });

  it('does not record the same place twice in a row', () => {
    const t = walk(inbox, inbox, thread('a'), thread('a'));
    expect(t.stops).toEqual([inbox, thread('a')]);
  });

  it('a new place after going back drops what was ahead', () => {
    const t = walk(inbox, thread('a'), thread('b'));
    const back = stepBack(t)!.trail;
    const next = arrive(back, files);
    expect(next.stops).toEqual([inbox, thread('a'), files]);
    expect(stepForward(next)).toBeNull();
  });

  it('moving between Settings pages is one place, kept at the page you were on', () => {
    const t = walk(inbox, { at: 'settings', pane: null }, { at: 'settings', pane: 'claude' });
    expect(t.stops).toEqual([inbox, { at: 'settings', pane: 'claude' }]);
    expect(stepBack(t)!.stop).toEqual(inbox);
  });

  it('skips a place that is gone, such as a deleted thread', () => {
    const t = walk(thread('a'), thread('gone'), inbox);
    const back = stepBack(t, (s) => !(s.at === 'thread' && s.id === 'gone'))!;
    expect(back.stop).toEqual(thread('a'));
    expect(stepBack(walk(thread('gone'), inbox), (s) => s.at !== 'thread')).toBeNull();
  });

  it('keeps the newest places when it is long', () => {
    let t = EMPTY_TRAIL;
    for (let i = 0; i < TRAIL_LIMIT + 10; i++) t = arrive(t, thread(String(i)));
    expect(t.stops.length).toBe(TRAIL_LIMIT);
    expect(t.stops[t.stops.length - 1]).toEqual(thread(String(TRAIL_LIMIT + 9)));
    expect(t.at).toBe(TRAIL_LIMIT - 1);
  });

  it('tells two tabs and two threads apart, and not the same thread twice', () => {
    expect(sameStop(inbox, { at: 'list', view: 'done' })).toBe(false);
    expect(sameStop(thread('a'), thread('b'))).toBe(false);
    expect(sameStop(thread('a'), { at: 'thread', product: 'q', id: 'a' })).toBe(false);
    expect(sameStop(thread('a'), thread('a'))).toBe(true);
  });
});

// Closing a thread with E passes through the list for a moment on its way to
// the next thread. Driving the built app, that moment was recorded, and back
// from the next thread went to the list instead of the thread just closed.
describe('a place counts once it stays on screen', () => {
  const recorded = () => {
    const seen: Stop[] = [];
    return { seen, rec: settledPlaces((s) => seen.push(s)) };
  };
  afterEach(() => { vi.useRealTimers(); });

  it('skips a place that flashed past on the way to the next thread', () => {
    vi.useFakeTimers();
    const { seen, rec } = recorded();
    rec.see(thread('a')); vi.advanceTimersByTime(SETTLE_MS + 1);
    rec.see(inbox); vi.advanceTimersByTime(20);
    rec.see(thread('b')); vi.advanceTimersByTime(SETTLE_MS + 1);
    expect(seen).toEqual([thread('a'), thread('b')]);
  });

  it('records a place you stayed on, however briefly you stayed after', () => {
    vi.useFakeTimers();
    const { seen, rec } = recorded();
    rec.see(inbox); vi.advanceTimersByTime(SETTLE_MS + 1);
    rec.see(files); vi.advanceTimersByTime(SETTLE_MS + 1);
    expect(seen).toEqual([inbox, files]);
  });

  it('records nothing for a place it was told to forget before it settled', () => {
    vi.useFakeTimers();
    const { seen, rec } = recorded();
    rec.see(inbox); rec.stop(); vi.advanceTimersByTime(SETTLE_MS * 2);
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

  it('are on on a computer and off on a phone, and walk the trail with ⌘[ and ⌘]', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).toMatch(/useBackAndForward\(/);
    expect(app).toMatch(/const backForwardOn = !onPhone\(\);/);
    expect(app).not.toMatch(/alpha\?\.backForward/);
    const hook = read('renderer/src/back-and-forward.ts');
    expect(hook).toMatch(/'\['/);
    expect(hook).toMatch(/'\]'/);
  });
});
