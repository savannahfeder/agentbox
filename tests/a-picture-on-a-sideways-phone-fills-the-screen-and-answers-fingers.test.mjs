// A picture opened on the phone app, turned sideways (w-0b107cbed2, 2026-10-28):
// "instead of showing a full image so I can see the width it gets smaller.
// Worse yet, none of the buttons in the corner even worked so I couldn't even
// close the image." And: "would be nice to be able to zoom into pictures on my
// phone (or designs)".
//
// Measured in WebKit at her screen, 874 x 402 sideways:
// - the stage kept 72pt above and 96pt below for the bars, so a picture as wide
//   as the screen was drawn 509 x 234;
// - the corner buttons faded 2.4 s after opening, because a finger never moves
//   the way a resting mouse does, and faded they took no taps
//   (pointer-events: none); on an iPhone the tap that brings them back is
//   swallowed, so Close never answered;
// - "Open in Preview" opens the file on the computer, which on a phone shows
//   nothing;
// - nothing in the view answered a pinch, and a design, being a page in a
//   frame, could only be pinched by the browser, which the app turns off.
// After the change, in the same WebKit: the picture is 874 x 402, the buttons
// are there after 3.5 s and each one answers a tap, a pinch enlarges, a finger
// pans, a double tap fits, and a swipe steps to the next picture.
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import { pinchTo, swipeStep, isDoubleTap, panToKeep } from '../renderer/src/picture-view';
import { letThePagePinch, pagePinched } from '../renderer/src/phone-screen';

const read = (f) => fs.readFileSync(new URL(`../renderer/src/${f}`, import.meta.url), 'utf8');
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const view = read('components/PictureView.tsx');
const phone = bare(read('phone.css'));
const styles = bare(read('styles.css'));

describe('turned sideways', () => {
  const at = phone.indexOf('@media (orientation: landscape) and (max-height: 520px)');
  const block = phone.slice(at, phone.indexOf('\n  }', at));

  it('the picture has the whole screen, inside the notch', () => {
    expect(at).toBeGreaterThan(-1);
    expect(block).toMatch(/\.pv-stage \{ inset: 0 env\(safe-area-inset-right, 0px\) 0 env\(safe-area-inset-left, 0px\); \}/);
  });

  it('the bar and the arrows keep clear of the notch and of each other', () => {
    expect(block).toMatch(/\.pv-top \{[^}]*left: calc\(8px \+ env\(safe-area-inset-left, 0px\)\)/);
    const top = /\.pv-top \{ top: (\d+)px/.exec(block);
    const step = /\.pv-step \{ top: (\d+)px; bottom: (\d+)px/.exec(block);
    // 46pt bar, and a 45pt thumbnail strip with 8pt padding.
    expect(Number(step[1])).toBeGreaterThanOrEqual(Number(top[1]) + 46);
    expect(Number(step[2])).toBeGreaterThanOrEqual(8 + 45 + 16);
  });

  it('upright is left as it was', () => {
    expect(phone.slice(0, at)).toMatch(/\.pv-stage \{ inset: calc\(72px \+ env\(safe-area-inset-top, 0px\)\) 8px /);
  });
});

describe('the corner buttons on a touch screen', () => {
  it('never fade on a timer', () => {
    expect(view).toMatch(/matchMedia\('\(hover: none\)'\)/);
    const wake = view.slice(view.indexOf('const wake = '), view.indexOf('useEffect(() => { wake();'));
    expect(wake).toMatch(/if \(touchScreen \|\|.*\) return;\n/);
    expect(wake.indexOf('if (touchScreen')).toBeLessThan(wake.indexOf('setTimeout'));
  });

  it('are put away and brought back by a tap, which never closes the view', () => {
    expect(view).toMatch(/setBare\(\(b\) => !b\)/);
    expect(view).toMatch(/Date\.now\(\) - touchedAt\.current > 800\) onClose\(\)/);
  });

  it('are big enough for a thumb, and nothing that only works on the computer', () => {
    expect(phone).toMatch(/\.pv-icon \{ width: 44px; height: 44px; \}/);
    expect(view).toMatch(/\{!onPhone\(\) && <button[^\n]*aria-label="Open in Preview"/);
  });

  it('the view keeps the fingers, and the strip still scrolls', () => {
    const own = /\.picture-view \{([^}]*)\}/.exec(styles)[1];
    expect(own).toMatch(/touch-action: none/);
    expect(styles).toMatch(/\.pv-strip \{ touch-action: pan-x; \}/);
  });
});

describe('fingers on the picture', () => {
  const start = { distance: 100, zoom: 1, pan: { x: 0, y: 0 }, mid: { x: 0, y: 0 } };

  it('a pinch out enlarges by the spread, a pinch in never goes below fitted, and never past the cap', () => {
    expect(pinchTo(start, 250, { x: 0, y: 0 }).zoom).toBe(2.5);
    expect(pinchTo(start, 40, { x: 0, y: 0 }).zoom).toBe(1);
    expect(pinchTo(start, 5000, { x: 0, y: 0 }).zoom).toBe(8);
  });

  it('keeps the point under the fingers under them, and follows them as they move', () => {
    const off = { ...start, mid: { x: 100, y: -40 } };
    const still = pinchTo(off, 200, { x: 100, y: -40 });
    expect(still.pan).toEqual(panToKeep(off.mid, off.pan, 1, 2));
    const moved = pinchTo(off, 200, { x: 130, y: -10 });
    expect(moved.pan).toEqual({ x: still.pan.x + 30, y: still.pan.y + 30 });
  });

  it('a swipe sideways steps, a short or steep one does not', () => {
    expect(swipeStep(-80, 10)).toBe(1);
    expect(swipeStep(80, -10)).toBe(-1);
    expect(swipeStep(-49, 0)).toBe(0);
    expect(swipeStep(-80, 60)).toBe(0);
  });

  it('two taps close in time and place are a double tap; slower or apart are not', () => {
    const a = { t: 1000, x: 100, y: 100 };
    expect(isDoubleTap(a, { t: 1250, x: 110, y: 105 })).toBe(true);
    expect(isDoubleTap(a, { t: 1310, x: 100, y: 100 })).toBe(false);
    expect(isDoubleTap(a, { t: 1100, x: 200, y: 100 })).toBe(false);
    expect(isDoubleTap(null, a)).toBe(false);
  });
});

describe('a design on the phone can be pinched', () => {
  afterEach(() => vi.unstubAllGlobals());
  const meta = () => {
    const m = { content: 'width=device-width, initial-scale=1.0, maximum-scale=1, viewport-fit=cover' };
    vi.stubGlobal('document', { querySelector: (s) => (s === 'meta[name="viewport"]' ? m : null) });
    return m;
  };

  it('while it is open, and the page is fixed again once the last one closes', () => {
    const m = meta();
    const shut = letThePagePinch();
    expect(m.content).toBe('width=device-width, initial-scale=1.0, maximum-scale=5, viewport-fit=cover');
    const shut2 = letThePagePinch();
    shut();
    shut();
    expect(m.content).toMatch(/maximum-scale=5/);
    shut2();
    expect(m.content).toBe('width=device-width, initial-scale=1.0, maximum-scale=1, viewport-fit=cover');
  });

  it('is opened by the design view, on a phone only', () => {
    expect(read('components/HtmlPreview.tsx')).toMatch(/useEffect\(\(\) => \(onPhone\(\) \? letThePagePinch\(\) : undefined\), \[\]\)/);
  });

  it('and a pinched page is not refitted or scrolled back under the fingers', () => {
    expect(pagePinched(1)).toBe(false);
    expect(pagePinched(1.5)).toBe(true);
    expect(read('phone-screen.ts')).toMatch(/if \(!vv \|\| pagePinched\(vv\.scale\)\) return;/);
    expect(read('browser-bridge.ts')).toMatch(/&& !pagePinched\(\)\) scrollTo\(0, 0\)/);
  });
});
