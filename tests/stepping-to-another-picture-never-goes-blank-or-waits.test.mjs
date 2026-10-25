// Stepping to the next or previous picture shows it at once, and a picture that
// cannot be read says so instead of leaving an empty room.
//
// What broke: "there are always real loading errors and lag" when stepping back.
// Measured in a built window with 5 MB screenshots (scripts/scratch harness):
// each step back took 337 to 619 ms before the picture showed, with the stage
// empty in between. Every step remounted the picture (`key={url}`), hid it until
// it loaded, and only then faded it in; nothing was fetched ahead; the blurred
// glow behind it fetched and decoded the same file a second time; and a picture
// that failed left the stage dark with no word.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { readyAround, PICTURE_WAIT_MS } from '../renderer/src/picture-view.ts';

const view = fs.readFileSync(new URL('../renderer/src/components/PictureView.tsx', import.meta.url), 'utf8');

describe('which pictures are made ready before they are asked for', () => {
  it('the one either side of the open one', () => {
    expect(readyAround(2, 5)).toEqual([3, 1]);
  });

  it('only the one that exists at either end', () => {
    expect(readyAround(0, 5)).toEqual([1]);
    expect(readyAround(4, 5)).toEqual([3]);
  });

  it('none with one picture', () => {
    expect(readyAround(0, 1)).toEqual([]);
  });
});

describe('the open picture stays until the next one can be drawn', () => {
  it('reads and decodes a picture off screen before it is shown', () => {
    expect(view).toMatch(/\.decode\(\)/);
  });

  it('does not remount the picture on every step', () => {
    expect(view).not.toMatch(/key=\{url\}/);
    expect(view).not.toMatch(/visibility: natural\.w \? 'visible' : 'hidden'/);
  });

  it('draws the glow from the picture already read, not a second fetch of the file', () => {
    expect(view).not.toMatch(/backgroundImage: `url\(/);
  });
});

describe('a picture that cannot be read', () => {
  it('is looked for by its path before anyone is told', () => {
    expect(view).toMatch(/resolve\(p\.path\)/);
  });

  it('says so in words', () => {
    expect(view).toMatch(/className="pv-missing"/);
  });

  it('gives up after a while rather than waiting for ever', () => {
    expect(PICTURE_WAIT_MS).toBeGreaterThan(0);
    expect(PICTURE_WAIT_MS).toBeLessThanOrEqual(20_000);
    expect(view).toMatch(/PICTURE_WAIT_MS/);
  });
});
