// BACK ON A PHONE NEVER LEAVES THE APP FOR A BLANK PAGE (2026-10-13).
//
// "Sometimes I'll do something like hit back ... and it'll just give me the
// screen and I have to often times close the app and then reopen it." The
// screenshot: the home-screen app showing an empty white page, an empty
// address bar ("Search or enter website name") and the bar iOS draws when the
// app has left its own pages. That is a back taken one step further than the
// app's own first screen, onto the empty page iOS opened it from.
//
// Two ways it happened, read in renderer/src/phone-screen.ts:
// - the home-screen swipe from the left edge called history.back() whenever a
//   thread's pane was on the screen, whether or not opening it had added a
//   step to go back over, so with no step it went back out of the app;
// - nothing stood between the inbox and whatever came before it, so any back
//   from the inbox (a second swipe, iOS's own gesture, an app opened from an
//   alert) left the app.
//
// Now the home-screen app keeps a floor under the inbox: a back from the inbox
// lands on it and is put straight back, and the swipe only goes back over a
// thread's own step. A close followed quickly by an open no longer closes the
// new thread when the old back arrives.
import { describe, it, expect } from 'vitest';
import { createPhoneBack, holdTheFloor, swipeMayGoBack } from '../renderer/src/phone-screen';

/** A history that starts on the blank page iOS opens an app from, then the app. */
function fakeWindow() {
  const entries = [{ state: null, url: 'about:blank' }, { state: null, url: '/' }];
  let at = 1;
  const pop = new Set();
  const fire = () => queueMicrotask(() => { for (const fn of [...pop]) fn({ state: entries[at].state }); });
  const win = {
    history: {
      get state() { return entries[at].state; },
      pushState(state) { entries.splice(at + 1); entries.push({ state, url: entries[at].url }); at += 1; },
      replaceState(state) { entries[at] = { ...entries[at], state }; },
      back() { if (at === 0) return; at -= 1; if (entries[at].url === 'about:blank') return; fire(); },
    },
    addEventListener(name, fn) { if (name === 'popstate') pop.add(fn); },
    removeEventListener(name, fn) { if (name === 'popstate') pop.delete(fn); },
  };
  return { win, url: () => entries[at].url, depth: () => at };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('a back from the inbox', () => {
  it('stays in the app when the floor is held', async () => {
    const { win, url } = fakeWindow();
    holdTheFloor(win);
    win.history.back();
    await tick();
    expect(url()).toBe('/');
    win.history.back();
    await tick();
    expect(url()).toBe('/');
  });

  it('and leaves for the blank page without it, which is what she saw', async () => {
    const { win, url } = fakeWindow();
    win.history.back();
    await tick();
    expect(url()).toBe('about:blank');
  });

  it('holding the floor twice (a reload) adds no second floor', () => {
    const { win, depth } = fakeWindow();
    holdTheFloor(win);
    const after = depth();
    holdTheFloor(win);
    expect(depth()).toBe(after);
  });
});

describe('a thread over the floor', () => {
  it('back closes the thread and lands on the inbox, still in the app', async () => {
    const { win, url } = fakeWindow();
    holdTheFloor(win);
    let closed = 0;
    const back = createPhoneBack(win, () => { closed += 1; });
    back.sync(true);
    win.history.back();
    await tick();
    expect(closed).toBe(1);
    expect(url()).toBe('/');
  });

  it('closing one thread and opening the next at once leaves the next one open', async () => {
    const { win } = fakeWindow();
    holdTheFloor(win);
    let closed = 0;
    const back = createPhoneBack(win, () => { closed += 1; });
    back.sync(true);
    back.sync(false);
    back.sync(true);
    await tick();
    expect(closed).toBe(0);
  });
});

describe('the swipe from the left edge', () => {
  it('goes back over a thread\'s own step', () => {
    expect(swipeMayGoBack({ 'agentbox-thread': true })).toBe(true);
  });
  it('does not go back when there is no such step: that back would leave the app', () => {
    expect(swipeMayGoBack(null)).toBe(false);
    expect(swipeMayGoBack({ 'agentbox-floor': true })).toBe(false);
    expect(swipeMayGoBack({ 'agentbox-inbox': true })).toBe(false);
  });
});
