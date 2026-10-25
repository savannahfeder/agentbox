// ON A LIGHT PAGE THE TRAY WAS FROSTED (w-93b3a1a796). It sat on the Mac's
// regular Liquid Glass, which over a dark page lets the page through and over
// a light one turns milky. Reported once it shipped: "Dark mode looks super
// good but when the agent is on a light background, it isn't transparent...
// you can't see any of the background. It's more like the frosted effect."
// Measured in captures of both styles on macOS 26.5 (2026-10-23): over a light
// green wallpaper the regular glass went pale and frosted while the clear
// glass stayed the wallpaper's green; over plain white and plain black the two
// read alike.
//
// So the tag sits on the clear style, which Apple publishes. The list keeps
// the regular glass: it is read a line at a time, and a busy page showing
// through the words would fight them.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cornerTagRig } from './helpers/corner-tag-rig.mjs';
import { loadLiquidGlass } from '../main/liquid-glass.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const T = 1_000_000_000;
const NEW = { ready: [{ id: 'w-1', title: 'Pricing page', says: 'is ready for you', since: T - 60_000 }], working: 3 };

function fakeGlass(tones = {}) {
  const calls = [];
  return {
    calls,
    set: (win, rect, opts) => calls.push([win.part, opts]),
    clear: () => {},
    tone: (win) => tones[win.part] ?? null,
  };
}
const lastSet = (glass, part) => glass.calls.filter((c) => c[0] === part).at(-1)?.[1];

describe('the tray\'s own glass is clear', () => {
  it('asks for the clear glass on the tag, over a light page and a dark one alike', () => {
    for (const tone of ['light', 'dark']) {
      const glass = fakeGlass({ tag: tone });
      const r = cornerTagRig({ at: T, glass });
      r.hand(NEW);
      r.pageUp('tag', { width: 90, height: 51, glass: { x: 11, y: 11, width: 68, height: 29 }, radius: 6.6 });
      expect(lastSet(glass, 'tag')).toEqual({ radius: 6.6, style: 'clear' });
    }
  });

  it('keeps the regular glass behind the list, which is read', () => {
    const glass = fakeGlass({ tag: 'light' });
    const r = cornerTagRig({ at: T, glass });
    r.hand(NEW);
    r.pageUp('tag', { width: 90, height: 51, glass: { x: 11, y: 11, width: 68, height: 29 }, radius: 6.6 });
    r.call('corner-tag:toggle');
    r.pageUp('card', { width: 300, height: 120, radius: 8 });
    expect(lastSet(glass, 'card')).toEqual({ radius: 8, tone: 'light' });
  });
});

describe('loading the Mac\'s glass passes the style through', () => {
  const win = { getNativeWindowHandle: () => 'handle' };

  it('hands the native part the style, and leaves it out when none is asked for', () => {
    const calls = [];
    const native = { available: () => true, set: (...a) => calls.push(a), clear: () => {}, tone: () => 'light' };
    const glass = loadLiquidGlass({ mac: true, load: () => native });
    glass.set(win, { x: 0, y: 0, width: 4, height: 4 }, { radius: 2, style: 'clear' });
    glass.set(win, { x: 0, y: 0, width: 4, height: 4 }, { radius: 2, tone: 'dark' });
    expect(calls.map((c) => c[2])).toEqual([{ radius: 2, style: 'clear' }, { radius: 2, tone: 'dark' }]);
  });
});

describe('the native part', () => {
  const source = fs.readFileSync(path.join(root, 'main/native/liquid-glass/liquid-glass.mm'), 'utf8');

  it('sets the published style, clear when asked and regular otherwise, only where the Mac has it', () => {
    expect(source).toMatch(/respondsToSelector:@selector\(setStyle:\)/);
    expect(source).toMatch(/Says\(env, argv\[2\], "style", "clear"\)/);
    expect(source).not.toContain('setValue:');
  });
});
