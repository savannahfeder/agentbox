// THE TRAY'S GLASS WAS A FILL, NOT GLASS (w-93b3a1a796). The page drew a
// translucent white chip and asked CSS to blur what was behind it, but a
// window's page cannot see the screen behind the window, so the blur blurred
// nothing: over a dark screen the tray was a pale slab. Her words, after a
// round of five more fills: "today isn't liquid glass... I did show you an
// example of liquid glass in the repo, and ours looks very different from
// that." That repo's look is the screen behind, bent and blurred, and only the
// Mac can see that screen.
//
// So on macOS 26 the tray's windows carry the Mac's own Liquid Glass
// (NSGlassEffectView, through main/native/liquid-glass), shaped to the glass
// the page draws, and the page stops drawing a fill of its own. The glass goes
// light over a white page and dark over a dark one, and says which; the page
// follows it with dark or light ink. Measured on macOS 26.5: over white the
// glass read light, over #111 it read dark.
//
// Where the Mac has no such glass (Linux, an older macOS, a build without the
// native part), nothing changes: the page draws its own glass as before.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cornerTagRig } from './helpers/corner-tag-rig.mjs';
import { TONE_EVERY_MS } from '../main/corner-tag.mjs';
import { loadLiquidGlass } from '../main/liquid-glass.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'renderer/src/corner-tag/corner-tag.css'), 'utf8');
const page = fs.readFileSync(path.join(root, 'renderer/src/corner-tag/main.tsx'), 'utf8');

const T = 1_000_000_000;
const NEW = { ready: [{ id: 'w-1', title: 'Pricing page', says: 'is ready for you', since: T - 60_000 }], working: 3 };

function fakeGlass(tones = {}) {
  const calls = [];
  return {
    calls,
    tones,
    set: (win, rect, opts) => calls.push(['set', win.part, rect, opts]),
    clear: (win) => calls.push(['clear', win.part]),
    tone: (win) => tones[win.part] ?? null,
  };
}
const toneSent = (w) => w.sent.filter((s) => s[0] === 'corner-tag:tone').map((s) => s[1]);

describe('the tray carries the Mac\'s own glass where there is one', () => {
  it('puts the glass exactly where the page draws it, as round as the page draws it', () => {
    const glass = fakeGlass({ tag: 'dark' });
    const r = cornerTagRig({ at: T, glass });
    r.hand(NEW);
    r.pageUp('tag', { width: 90, height: 51, glass: { x: 11, y: 11, width: 68, height: 29 }, radius: 14.5 });
    const set = glass.calls.filter((c) => c[0] === 'set' && c[1] === 'tag').at(-1);
    expect(set[2]).toEqual({ x: 11, y: 11, width: 68, height: 29 });
    // The tag's glass is left to read the screen behind it for itself, and is
    // the clear glass (the-trays-glass-is-clear-so-a-light-page-shows-through).
    expect(set[3]).toEqual({ radius: 14.5, style: 'clear' });
  });

  it('tells the page the glass is the Mac\'s, so the page draws no fill of its own', () => {
    const r = cornerTagRig({ at: T, glass: fakeGlass() });
    r.hand(NEW);
    r.pageUp();
    expect(r.lastState().glass).toBe(true);
  });

  it('gives the list its own glass, the whole of its window', () => {
    const glass = fakeGlass({ tag: 'light' });
    const r = cornerTagRig({ at: T, glass });
    r.hand(NEW);
    r.pageUp('tag', { width: 90, height: 51, glass: { x: 11, y: 11, width: 68, height: 29 }, radius: 14.5 });
    r.call('corner-tag:toggle');
    r.pageUp('card', { width: 300, height: 120, radius: 12 });
    const set = glass.calls.filter((c) => c[0] === 'set' && c[1] === 'card').at(-1);
    expect(set[2]).toEqual({ x: 0, y: 0, width: 300, height: 120 });
    expect(set[3].radius).toBe(12);
  });
});

// GLASS THE LIST'S SIZE IGNORES THE SCREEN. Measured on macOS 26.5 with a dark
// Mac: over a white page, glass up to 120 by 50 points went light and anything
// from 190 by 110 went dark grey, empty or not, so the list read as a grey
// slab beside a light tag. Large glass follows the Mac's own dark or light
// setting, which is the one thing this tray must never follow. So the list is
// held to the tag's reading of what is behind it.
describe('the list follows the tag, never the Mac\'s own setting', () => {
  const open = (glass) => {
    const r = cornerTagRig({ at: T, glass });
    r.hand(NEW);
    r.pageUp('tag', { width: 90, height: 51, glass: { x: 11, y: 11, width: 68, height: 29 }, radius: 6.6 });
    r.call('corner-tag:toggle');
    r.pageUp('card', { width: 300, height: 120, radius: 8 });
    return r;
  };
  const cardSets = (glass) => glass.calls.filter((c) => c[0] === 'set' && c[1] === 'card');

  it('holds the list\'s glass light over a white page, though large glass on a dark Mac goes dark', () => {
    const glass = fakeGlass({ tag: 'light', card: 'dark' });
    const r = open(glass);
    expect(cardSets(glass).at(-1)[3]).toEqual({ radius: 8, tone: 'light' });
    expect(toneSent(r.win('card'))).toEqual(['light']);
  });

  it('holds it dark over a dark screen', () => {
    const glass = fakeGlass({ tag: 'dark', card: 'light' });
    const r = open(glass);
    expect(cardSets(glass).at(-1)[3]).toEqual({ radius: 8, tone: 'dark' });
    expect(toneSent(r.win('card'))).toEqual(['dark']);
  });

  it('turns with the tag when the tray is dragged from a white page onto a dark one', () => {
    const glass = fakeGlass({ tag: 'light' });
    const r = open(glass);
    glass.tones.tag = 'dark';
    r.advance(TONE_EVERY_MS + 1);
    expect(cardSets(glass).at(-1)[3]).toEqual({ radius: 8, tone: 'dark' });
    expect(toneSent(r.win('card'))).toEqual(['light', 'dark']);
    expect(toneSent(r.win())).toEqual(['light', 'dark']);
  });

  it('lets the list decide for itself only until the tag has a reading', () => {
    const glass = fakeGlass({});
    open(glass);
    expect(cardSets(glass).at(-1)[3]).toEqual({ radius: 8 });
  });

  it('tells a reloaded list which way the glass went', () => {
    const glass = fakeGlass({ tag: 'dark' });
    const r = open(glass);
    r.win('card').sent.length = 0;
    r.reload('card');
    r.call('corner-tag:ready', { part: 'card' });
    expect(toneSent(r.win('card'))).toEqual(['dark']);
  });

  it('draws its own glass, as before, where the Mac has none', () => {
    const r = cornerTagRig({ at: T, glass: null });
    r.hand(NEW);
    r.pageUp();
    expect(r.win().visible).toBe(true);
    expect(r.lastState().glass).toBe(false);
    expect(toneSent(r.win())).toEqual([]);
  });
});

describe('the ink follows the glass, not the Mac\'s own setting', () => {
  it('says light or dark as soon as the glass is up, and again only when it changes', () => {
    const glass = fakeGlass({ tag: 'light' });
    const r = cornerTagRig({ at: T, glass });
    r.hand(NEW);
    r.pageUp();
    expect(toneSent(r.win())).toEqual(['light']);
    r.advance(TONE_EVERY_MS * 3);
    expect(toneSent(r.win())).toEqual(['light']);
    glass.tones.tag = 'dark';
    r.advance(TONE_EVERY_MS + 1);
    expect(toneSent(r.win())).toEqual(['light', 'dark']);
  });

  it('stops asking once the tray is gone, so nothing keeps running for an empty corner', () => {
    const glass = fakeGlass({ tag: 'light' });
    const r = cornerTagRig({ at: T, glass });
    r.hand(NEW);
    r.pageUp();
    r.enterApp();
    expect(r.win().visible).toBe(false);
    r.advance(TONE_EVERY_MS * 2);
    expect(r.timers).toHaveLength(0);
  });

  it('never reads the Mac\'s light or dark setting in the page', () => {
    expect(css).not.toContain('prefers-color-scheme');
    expect(page).not.toContain('theme');
    // The only light-or-dark branch is the glass's own reading of the screen
    // behind it, and it exists only where that glass does.
    for (const line of css.split('\n').filter((l) => l.includes('ct-tone-'))) {
      expect(line).toContain('.ct-native');
    }
  });
});

describe('the page lets the Mac\'s glass show', () => {
  it('drops its own fill, edge and blur when the glass is the Mac\'s', () => {
    const rule = css.match(/\.ct-native \.ct-glass[^{]*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/background:\s*transparent/);
    expect(rule).toMatch(/border-color:\s*transparent/);
    expect(rule).toMatch(/box-shadow:\s*none/);
    expect(rule).toMatch(/backdrop-filter:\s*none/);
  });

  it('reports how round its glass is, so the Mac\'s matches it', () => {
    expect(page).toMatch(/borderTopLeftRadius/);
  });

  // Her reference was liquid-glass-react, and the Mac's glass alone read as a
  // plain tinted chip at the tray's size: its border layer is the part that
  // says glass, so it is copied here.
  it('draws liquid-glass-react\'s rim on the Mac\'s glass, light on dark glass and ink on light', () => {
    const rim = css.match(/\.ct-native \.ct-glass::after\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rim).toMatch(/padding:\s*1\.5px/);
    expect(rim).toMatch(/mask-composite:\s*exclude/);
    expect(rim).toMatch(/linear-gradient\(135deg, rgba\(255, 255, 255, 0\) 0%, rgba\(255, 255, 255, 0\.32\) 33%, rgba\(255, 255, 255, 0\.6\) 66%/);
    const onLight = css.match(/\.ct-native\.ct-tone-light \.ct-glass::after\s*\{[^}]*\}/)?.[0] ?? '';
    expect(onLight).toMatch(/rgba\(0, 0, 0, 0\.16\)/);
  });

  it('draws no rim where the page draws its own glass', () => {
    expect(css).not.toMatch(/(^|\n|,)\s*\.ct-glass::after/);
  });

  // "Just the dots" was her pick (w-93b3a1a796), in the small corners she
  // approved on 2026-10-08, not the Mac's capsule an earlier build gave it.
  it('keeps the tag in the small corners she approved', () => {
    const tag = [...css.matchAll(/\n\.ct-tag \{[^}]*\}/g)].map((m) => m[0]).join('\n');
    expect(tag).toMatch(/border-radius:\s*calc\(6px \* var\(--ct-s\)\)/);
    expect(tag).not.toMatch(/border-radius:\s*calc\(14px/);
  });
});

describe('loading the Mac\'s glass', () => {
  const win = { getNativeWindowHandle: () => 'handle' };
  const native = (available = true) => {
    const calls = [];
    return { calls, available: () => available, set: (...a) => calls.push(a), clear: () => {}, tone: () => 'dark' };
  };

  it('passes the shape through, and a reading only when there is one', () => {
    const n = native();
    const glass = loadLiquidGlass({ mac: true, load: () => n });
    glass.set(win, { x: 1, y: 2, width: 3, height: 4 }, { radius: 6 });
    glass.set(win, { x: 1, y: 2, width: 3, height: 4 }, { radius: 8, tone: 'light' });
    expect(n.calls).toEqual([
      ['handle', { x: 1, y: 2, width: 3, height: 4 }, { radius: 6 }],
      ['handle', { x: 1, y: 2, width: 3, height: 4 }, { radius: 8, tone: 'light' }],
    ]);
  });

  it('is nothing off a Mac, on a Mac without the glass, or when the build left no binary', () => {
    expect(loadLiquidGlass({ mac: false, load: () => native() })).toBe(null);
    expect(loadLiquidGlass({ mac: true, load: () => native(false) })).toBe(null);
    expect(loadLiquidGlass({ mac: true, load: () => { throw new Error('Cannot find module'); } })).toBe(null);
  });
});

describe('the native part', () => {
  const source = fs.readFileSync(path.join(root, 'main/native/liquid-glass/liquid-glass.mm'), 'utf8');

  it('asks for the Mac\'s glass by name, so it builds without the newest SDK and does nothing without it', () => {
    expect(source).toContain('NSClassFromString(@"NSGlassEffectView")');
    expect(source).not.toMatch(/\[NSGlassEffectView /);
  });

  // The glass has settings Apple does not publish (_variant and the rest),
  // and two of them looked more liquid in the pictures. A macOS update can
  // rename them, so the tray uses none.
  it('uses only the glass settings Apple publishes', () => {
    for (const word of ['_variant', '_subduedState', '_contentLensing', '_interactionState', '_scrimState', '_adaptiveAppearance', 'setValue:']) {
      expect(source).not.toContain(word);
    }
  });

  it('holds the glass light or dark with the published appearance, and lets it decide without one', () => {
    expect(source).toMatch(/NSAppearanceNameAqua/);
    expect(source).toMatch(/NSAppearanceNameDarkAqua/);
    expect(source).toMatch(/: nil;/);
  });

  it('reads nothing of the screen itself and asks for no permission', () => {
    for (const word of ['CGWindowListCreateImage', 'SCScreenshotManager', 'SCStream', 'CGDisplayCreateImage', 'CGRequestScreenCaptureAccess']) {
      expect(source).not.toContain(word);
    }
  });
});
