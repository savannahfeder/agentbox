// WHICH SCREEN GETS WHICH SET OF THE SAME PICTURE, 2026-08-22.
//
// The rule has to answer for a display nobody here can plug in, so the display
// is made up and only the fields the rule reads are set. The numbers in the
// first two cases are not invented: her laptop was read off the running app on
// 2026-08-22 (one display, internal, scaleFactor 2, 1710x1107 points, window
// zoom 1.2), and the 34" is 3440x1440 at scaleFactor 1 off her own screenshot.
//
// EVERY WRONG ANSWER HERE FALLS THE SAME WAY, towards 'sharp'. Sharp is what
// every screen painted before this existed, so an unreadable display downgrades
// nothing; the failure mode of the other default is a picture she never asked
// to be softened, on a screen she cannot name to us.

import { describe, expect, it } from 'vitest';
import { screenDetailFor } from '../main/screen-detail.mjs';
import { applySkinDetail, resolveSkinDetail } from '../renderer/src/skins.ts';

describe('which set of theme pictures a screen gets', () => {
  it('softens on her laptop panel', () => {
    expect(screenDetailFor({ internal: true, scaleFactor: 2, size: { width: 1710, height: 1107 } })).toBe('soft');
  });

  it('stays sharp on the 34 inch', () => {
    expect(screenDetailFor({ internal: false, scaleFactor: 1, size: { width: 3440, height: 1440 } })).toBe('sharp');
  });

  it('stays sharp on a big external Retina screen', () => {
    // A 5K 27" reports scaleFactor 2 like the laptop does. Density alone would
    // soften it, and it is not a small screen, which is why `internal` and not
    // a density threshold is the test.
    expect(screenDetailFor({ internal: false, scaleFactor: 2, size: { width: 2560, height: 1440 } })).toBe('sharp');
  });

  it('stays sharp on a built-in screen that is not dense', () => {
    // Both halves are required. A 1x built-in panel is painting one image pixel
    // per screen pixel, which is where the sharp set already looks right.
    expect(screenDetailFor({ internal: true, scaleFactor: 1, size: { width: 1440, height: 900 } })).toBe('sharp');
  });

  it('falls to sharp on a display it cannot read', () => {
    expect(screenDetailFor(null)).toBe('sharp');
    expect(screenDetailFor(undefined)).toBe('sharp');
    expect(screenDetailFor({})).toBe('sharp');
    expect(screenDetailFor({ internal: true })).toBe('sharp');
    expect(screenDetailFor({ internal: true, scaleFactor: NaN })).toBe('sharp');
    expect(screenDetailFor({ internal: true, scaleFactor: '2' })).toBe('sharp');
  });
});

describe('what the window does with the answer', () => {
  it('reads anything that is not the word soft as sharp', () => {
    expect(resolveSkinDetail('soft')).toBe('soft');
    expect(resolveSkinDetail('sharp')).toBe('sharp');
    expect(resolveSkinDetail(undefined)).toBe('sharp');
    expect(resolveSkinDetail(null)).toBe('sharp');
    expect(resolveSkinDetail('SOFT')).toBe('sharp');
  });

  it('spells out soft and REMOVES the attribute for sharp', () => {
    // Sharp is the plain rule in the stylesheet and soft is an override on this
    // attribute, so a window that never hears from main paints what it always
    // painted. Leaving `data-skin-detail="sharp"` behind would be harmless
    // today and is exactly the sort of thing a later selector starts matching.
    const set = [];
    const root = {
      setAttribute: (k, v) => set.push(['set', k, v]),
      removeAttribute: (k) => set.push(['remove', k]),
    };
    applySkinDetail('soft', root);
    applySkinDetail('sharp', root);
    expect(set).toEqual([
      ['set', 'data-skin-detail', 'soft'],
      ['remove', 'data-skin-detail'],
    ]);
  });
});
