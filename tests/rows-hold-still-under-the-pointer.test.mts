// ROWS HOLD STILL UNDER THE POINTER.
//
// Rows in Needs you moved while someone was ticking them, and three
// clicks landed on a row's one-click Unshare and made threads private with no
// confirmation. So while the pointer is on the list its rows keep their places:
// what changed order waits for the pointer to leave, a row that arrives goes to
// the foot, and a row that is finished still leaves.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { steadyOrder, HOLD_IDLE_MS, pointerHold } from '../renderer/src/threads/steady-rows.ts';

const rows = (...ids) => ids.map((id) => ({ id }));
const held = (was, now) => steadyOrder(was, rows(...now), (r) => r.id).map((r) => r.id);

describe('the order while the pointer is on the list', () => {
  it('a row that moved to the top keeps its place', () => {
    expect(held(['a', 'b', 'c'], ['c', 'a', 'b'])).toEqual(['a', 'b', 'c']);
  });
  it('a row that arrives goes to the foot, not the top', () => {
    expect(held(['a', 'b'], ['new', 'a', 'b'])).toEqual(['a', 'b', 'new']);
  });
  it('two that arrive keep their own order at the foot', () => {
    expect(held(['a'], ['x', 'y', 'a'])).toEqual(['a', 'x', 'y']);
  });
  it('a row that is finished leaves, and the rest close up', () => {
    expect(held(['a', 'b', 'c'], ['a', 'c'])).toEqual(['a', 'c']);
  });
  it('nothing drawn yet means the list as it comes', () => {
    expect(held([], ['b', 'a'])).toEqual(['b', 'a']);
  });
  it('hands back the fresh row, not the old one', () => {
    const fresh = { id: 'a', title: 'new words' };
    expect(steadyOrder(['a'], [fresh], (r) => r.id)[0]).toBe(fresh);
  });
});

describe('how long it holds', () => {
  const clock = () => {
    let at = 0; let id = 0; const due = new Map();
    return {
      timers: { setTimeout: (fn, ms) => { id += 1; due.set(id, { fn, when: at + ms }); return id; }, clearTimeout: (h) => due.delete(h) },
      pass: (ms) => { at += ms; for (const [k, d] of [...due]) if (d.when <= at) { due.delete(k); d.fn(); } },
    };
  };
  const started = () => {
    const c = clock(); let on = false;
    const hold = pointerHold((v) => { on = v; }, c.timers);
    return { c, hold, on: () => on };
  };
  it('holds from the pointer moving on the list', () => {
    const { hold, on } = started();
    expect(on()).toBe(false);
    hold.move();
    expect(on()).toBe(true);
  });
  it('holds up to just before the idle limit, and each move starts it again', () => {
    const { c, hold, on } = started();
    hold.move();
    c.pass(HOLD_IDLE_MS - 1);
    expect(on()).toBe(true);
    hold.move();
    c.pass(HOLD_IDLE_MS - 1);
    expect(on()).toBe(true);
  });
  it('lets go at the idle limit, so a pointer left parked cannot hold the list for ever', () => {
    const { c, hold, on } = started();
    hold.move();
    c.pass(HOLD_IDLE_MS);
    expect(on()).toBe(false);
  });
  it('lets go when the pointer leaves, and no late timer turns it back on', () => {
    const { c, hold, on } = started();
    hold.move();
    hold.leave();
    expect(on()).toBe(false);
    c.pass(HOLD_IDLE_MS * 2);
    expect(on()).toBe(false);
  });
});

describe('in the app', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  it('holds the list it draws and the keys walk', () => {
    expect(app).toMatch(/useHeldOrder\(displayedBox/);
    expect(app).toMatch(/const list = [^\n]*boardOrder \?\? heldBox\.rows/);
  });
  it('a drag or a pin is the person moving a row, so it is let through', () => {
    const keep = app.slice(app.indexOf('const keepPlaces = useCallback'), app.indexOf('const reorderThread = useCallback'));
    expect(keep.match(/letRowsMove\(\)/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
