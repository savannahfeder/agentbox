// THE TRAY WENT DARK ON WHITE PAGES. Its ink, and its list's glass, followed
// the appearance the Mac's glass reported, and on a Mac set to dark that never
// changed: a probe on macOS 27.0.1 put the clear and the regular glass, at the
// tray's size and larger, over white, black, #262626 and #f2f2f2 windows, and
// every reading was "dark". So the tray was a grey pill with pale ink on a
// white page.
//
// The glass does measure what is behind it: its backdrop layer reports the
// brightness under it when asked to track it. Over another program's window
// that stepped through white, black, 0.15, 0.95 and 0.5 grey, it read 1.000,
// 0.000, 0.156, 0.953 and 0.500, each within a second, with no screen
// recording permission. The tray now takes light or dark from that number,
// and holds both its glasses to it.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cornerTagRig } from './helpers/corner-tag-rig.mjs';
import { TONE_EVERY_MS } from '../main/corner-tag.mjs';
import { loadLiquidGlass } from '../main/liquid-glass.mjs';
import { toneFromLuma } from '../shared/corner-tag.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const T = 1_000_000_000;
const NEW = { ready: [{ id: 'w-1', title: 'Pricing page', says: 'is ready for you', since: T - 60_000 }], working: 3 };

// `reads` is what the glass says: its appearance, and the brightness behind it.
function fakeGlass({ tone = 'dark', luma = null } = {}) {
  const calls = [];
  const reads = { tone, luma };
  return {
    calls, reads,
    set: (win, rect, opts) => calls.push(['set', win.part, rect, opts]),
    clear: (win) => calls.push(['clear', win.part]),
    tone: (win) => (win.part === 'tag' ? reads.tone : null),
    luma: (win) => (win.part === 'tag' ? reads.luma : null),
  };
}
const toneSent = (w) => w.sent.filter((s) => s[0] === 'corner-tag:tone').map((s) => s[1]);
const lastSet = (glass, part) => glass.calls.filter((c) => c[0] === 'set' && c[1] === part).at(-1)?.[3];
const up = (glass) => {
  const r = cornerTagRig({ at: T, glass });
  r.hand(NEW);
  r.pageUp('tag', { width: 90, height: 51, glass: { x: 11, y: 11, width: 68, height: 29 }, radius: 6.6 });
  return r;
};

describe('light or dark from the brightness behind the tray', () => {
  it('is light over a white page though the glass on a dark Mac says dark', () => {
    const glass = fakeGlass({ tone: 'dark', luma: 1 });
    const r = up(glass);
    expect(toneSent(r.win())).toEqual(['light']);
    expect(lastSet(glass, 'tag')).toEqual({ radius: 6.6, style: 'clear', tone: 'light' });
  });

  it('is dark over a black page though the glass on a light Mac says light', () => {
    const glass = fakeGlass({ tone: 'light', luma: 0 });
    const r = up(glass);
    expect(toneSent(r.win())).toEqual(['dark']);
    expect(lastSet(glass, 'tag')).toEqual({ radius: 6.6, style: 'clear', tone: 'dark' });
  });

  it('holds the list to the same reading', () => {
    const glass = fakeGlass({ tone: 'dark', luma: 0.95 });
    const r = up(glass);
    r.call('corner-tag:toggle');
    r.pageUp('card', { width: 300, height: 120, radius: 8 });
    expect(lastSet(glass, 'card')).toEqual({ radius: 8, tone: 'light' });
    expect(toneSent(r.win('card'))).toEqual(['light']);
  });

  it('turns when the tray is dragged from a white page onto a dark one, and back', () => {
    const glass = fakeGlass({ luma: 0.95 });
    const r = up(glass);
    glass.reads.luma = 0.12;
    r.advance(TONE_EVERY_MS + 1);
    glass.reads.luma = 0.9;
    r.advance(TONE_EVERY_MS + 1);
    expect(toneSent(r.win())).toEqual(['light', 'dark', 'light']);
    expect(lastSet(glass, 'tag').tone).toBe('light');
  });

  it('keeps its last reading through a gap rather than taking the glass\'s word', () => {
    const glass = fakeGlass({ tone: 'dark', luma: 0.9 });
    const r = up(glass);
    glass.reads.luma = null;
    r.advance(TONE_EVERY_MS * 3);
    expect(toneSent(r.win())).toEqual(['light']);
    expect(lastSet(glass, 'tag').tone).toBe('light');
  });

  it('falls back to the glass\'s own word, and holds nothing, where there is no brightness reading', () => {
    const glass = fakeGlass({ tone: 'light', luma: null });
    const r = up(glass);
    expect(toneSent(r.win())).toEqual(['light']);
    // Holding the tag to a tone read from the tag's own appearance would
    // read back that same hold for ever.
    expect(lastSet(glass, 'tag')).toEqual({ radius: 6.6, style: 'clear' });
  });
});

describe('toneFromLuma', () => {
  it('splits a first reading at the middle', () => {
    expect(toneFromLuma(0.5)).toBe('light');
    expect(toneFromLuma(0.49)).toBe('dark');
  });

  // A page whose brightness sits near the middle, a mid-grey or a photo,
  // must not flip the ink every half second as it drifts by a point.
  it('keeps the tone it has inside a band around the middle', () => {
    expect(toneFromLuma(0.44, 'light')).toBe('light');
    expect(toneFromLuma(0.56, 'dark')).toBe('dark');
  });

  it('changes once the reading is clearly past the band', () => {
    expect(toneFromLuma(0.39, 'light')).toBe('dark');
    expect(toneFromLuma(0.61, 'dark')).toBe('light');
  });

  it('gives nothing for no reading', () => {
    for (const v of [null, undefined, NaN, -0.1, 1.1, 'light']) expect(toneFromLuma(v, 'dark')).toBe(null);
  });
});

describe('the native part reads the brightness', () => {
  const source = fs.readFileSync(path.join(root, 'main/native/liquid-glass/liquid-glass.mm'), 'utf8');

  it('passes the reading through, and nothing from an older build that cannot read it', () => {
    const win = { getNativeWindowHandle: () => 'handle' };
    const base = { available: () => true, set: () => {}, clear: () => {}, tone: () => 'dark' };
    expect(loadLiquidGlass({ mac: true, load: () => ({ ...base, luma: () => 0.8 }) }).luma(win)).toBe(0.8);
    expect(loadLiquidGlass({ mac: true, load: () => base }).luma(win)).toBe(null);
  });

  // The backdrop layer's luma tracking is not published. A macOS that drops
  // it must leave the tray on the glass's own word, not crash it.
  it('asks before using anything it was not promised', () => {
    expect(source).toMatch(/respondsToSelector:\s*TracksLuma\(\)/);
    expect(source).toMatch(/NSClassFromString\(@"CABackdropLayer"\)/);
  });

  it('reads nothing of the screen itself and asks for no permission', () => {
    for (const word of ['CGWindowListCreateImage', 'SCScreenshotManager', 'SCStream', 'CGDisplayCreateImage', 'CGRequestScreenCaptureAccess']) {
      expect(source).not.toContain(word);
    }
  });
});
