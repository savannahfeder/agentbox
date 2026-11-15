// SWIPING BACK DID NOTHING ON A PHONE (2026-10-11): "like swiping back to the
// inbox page from inside a thread". Opening a thread changed what the screen
// drew and left the browser's history alone, so Safari's own swipe from the
// left edge had nowhere to go back to, and a page added to the home screen has
// no such swipe at all. Measured by reading renderer/src/App.tsx: nothing on
// the way into a thread called history.pushState.
//
// Now opening a thread on a phone adds one step to the history, the browser's
// back (Safari's swipe) closes the thread, and on the home-screen app a swipe
// from the left edge does the same.
import { describe, it, expect } from 'vitest';
import { createPhoneBack, edgeSwipeGoesBack } from '../renderer/src/phone-screen';

/** A history and a window that record what was done to them. */
function fakeWindow() {
  const entries = [{ state: null }];
  let at = 0;
  const pop = new Set();
  const win = {
    history: {
      get state() { return entries[at].state; },
      pushState(state) { entries.splice(at + 1); entries.push({ state }); at += 1; },
      back() { if (at === 0) return; at -= 1; queueMicrotask(() => { for (const fn of pop) fn({ state: entries[at].state }); }); },
    },
    addEventListener(name, fn) { if (name === 'popstate') pop.add(fn); },
    removeEventListener(name, fn) { if (name === 'popstate') pop.delete(fn); },
  };
  return { win, depth: () => at };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('on a phone, a thread is a step in the history', () => {
  it('opening one adds a step, and going back closes it', async () => {
    const { win, depth } = fakeWindow();
    let closed = 0;
    const back = createPhoneBack(win, () => { closed += 1; });
    back.sync(true);
    expect(depth()).toBe(1);
    win.history.back();
    await tick();
    expect(closed).toBe(1);
    expect(depth()).toBe(0);
  });

  it('opening a second thread from the first adds no second step', () => {
    const { win, depth } = fakeWindow();
    const back = createPhoneBack(win, () => {});
    back.sync(true);
    back.sync(true);
    expect(depth()).toBe(1);
  });

  it('closing it with its own back arrow takes the step away, without closing it twice', async () => {
    const { win, depth } = fakeWindow();
    let closed = 0;
    const back = createPhoneBack(win, () => { closed += 1; });
    back.sync(true);
    back.sync(false);
    await tick();
    expect(depth()).toBe(0);
    expect(closed).toBe(0);
  });

  it('a back that is not ours closes nothing', async () => {
    const { win } = fakeWindow();
    let closed = 0;
    const back = createPhoneBack(win, () => { closed += 1; });
    win.history.pushState({ other: true }, '');
    win.history.back();
    await tick();
    expect(closed).toBe(0);
    back.stop();
  });
});

describe('a swipe from the left edge goes back', () => {
  const width = 393;
  it('when it starts at the edge and travels a good way right', () => {
    expect(edgeSwipeGoesBack({ startX: 6, dx: 140, dy: 10, width })).toBe(true);
  });
  it('not when it starts away from the edge, which is scrolling or selecting', () => {
    expect(edgeSwipeGoesBack({ startX: 60, dx: 200, dy: 0, width })).toBe(false);
  });
  it('not when it is short', () => {
    expect(edgeSwipeGoesBack({ startX: 6, dx: 60, dy: 0, width })).toBe(false);
  });
  it('not when it is mostly up or down', () => {
    expect(edgeSwipeGoesBack({ startX: 6, dx: 130, dy: 160, width })).toBe(false);
  });
  it('not when it goes left', () => {
    expect(edgeSwipeGoesBack({ startX: 6, dx: -150, dy: 0, width })).toBe(false);
  });
});
