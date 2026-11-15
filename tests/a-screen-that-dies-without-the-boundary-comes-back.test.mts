// THE TAB WENT DARK AND STAYED DARK (w-835e865efc, F-129).
//
// Measured on 2026-10-29 by driving the published 0.1.18 browser copy with a
// real Chromium: a brand-new user sends their first task, the inbox draws the
// ↵ hint beside the new row, and the page turns black. The console says
// "Minified React error #185", which is Maximum update depth exceeded, and
// `document.getElementById('root').childElementCount` is 0. Nothing came back
// until the tokened url was opened again.
//
// The loop itself is gone (0566ee8b). THE HOLE IT WENT THROUGH IS NOT.
// ScreenCrash is a boundary, and a boundary only sees a throw that happens
// inside rendering a child. React answers an update loop by unmounting the
// whole root instead, so `componentDidCatch` never ran, the reload it would
// have made never happened, and the one thing left running was the window's
// own error listener. That listener now does what the boundary would have.
//
// The cases: a screen that drew and is now empty comes back; a screen that
// never drew is boot, not death; a root with anything in it is alive, the
// stuck plate included; and twice in a minute stops reloading and says so.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  CRASH_RELOAD_KEY, CRASHED_TWICE, screenDrew, theScreenDied, comeBackFromABlankScreen,
} from '../renderer/src/after-a-crash';

const store = () => {
  const held = new Map();
  return { getItem: (k) => held.get(k) ?? null, setItem: (k, v) => held.set(k, String(v)) };
};

const root = (children) => ({ childElementCount: children });

beforeEach(() => { screenDrew(false); });

describe('whether an empty root is a dead screen', () => {
  it('is dead when the screen drew and the root is empty now', () => {
    screenDrew();
    expect(theScreenDied(root(0))).toBe(true);
  });

  it('is not dead before the first paint, which is every boot', () => {
    expect(theScreenDied(root(0))).toBe(false);
  });

  it('is not dead while anything is still drawn, the stuck plate included', () => {
    screenDrew();
    expect(theScreenDied(root(1))).toBe(false);
  });

  it('is not dead when there is no root at all to read', () => {
    screenDrew();
    expect(theScreenDied(null)).toBe(false);
  });
});

describe('what the window does about it', () => {
  it('reloads the tab, once, so the inbox comes back on its own', () => {
    screenDrew();
    const reloads = [];
    const said = [];
    const kept = store();
    const did = comeBackFromABlankScreen({
      root: root(0), now: 1000, store: () => kept,
      reload: () => reloads.push(1), say: (words) => said.push(words),
    });
    expect(did).toBe('reload');
    expect(reloads).toHaveLength(1);
    expect(said).toEqual([]);
  });

  it('says so rather than reloading for ever when the tab dies again straight away', () => {
    screenDrew();
    const reloads = [];
    const said = [];
    const kept = store();
    comeBackFromABlankScreen({ root: root(0), now: 1000, store: () => kept, reload: () => reloads.push(1), say: (w) => said.push(w) });
    const again = comeBackFromABlankScreen({
      root: root(0), now: 1000 + 5_000, store: () => kept,
      reload: () => reloads.push(1), say: (w) => said.push(w),
    });
    expect(again).toBe('stay');
    expect(reloads).toHaveLength(1);
    expect(said).toEqual([CRASHED_TWICE]);
  });

  it('reloads again for a death a long time later, which is not a loop', () => {
    screenDrew();
    const reloads = [];
    const kept = store();
    comeBackFromABlankScreen({ root: root(0), now: 1000, store: () => kept, reload: () => reloads.push(1), say: () => {} });
    comeBackFromABlankScreen({ root: root(0), now: 1000 + 3_600_000, store: () => kept, reload: () => reloads.push(1), say: () => {} });
    expect(reloads).toHaveLength(2);
  });

  it('does nothing at all while the screen is still drawn', () => {
    screenDrew();
    const reloads = [];
    const kept = store();
    const did = comeBackFromABlankScreen({ root: root(3), now: 1000, store: () => kept, reload: () => reloads.push(1), say: () => {} });
    expect(did).toBe(null);
    expect(reloads).toEqual([]);
    expect(kept.getItem(CRASH_RELOAD_KEY)).toBe(null);
  });
});
