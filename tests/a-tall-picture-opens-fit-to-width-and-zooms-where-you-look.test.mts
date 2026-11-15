// A TALL PICTURE OPENS FIT TO WIDTH, SCROLLS, AND ZOOMS WHERE YOU LOOK.
//
// Sofia: a full-page screenshot of four states opened at 13%,
// "an unreadable strip with a lot of dark either side"; a 390-wide phone picture
// opened at 45%. Zoom plus centred on the middle of the picture and cut the left
// of the page off. Measured with the viewer's own sum: fitScale fits the whole
// picture in the box, so a 1440 x 9000 page in a 1000 x 700 box is drawn at 8%.
// Now a picture that fitting its height would squeeze into a strip is fitted to
// the width (never past its real pixels) and scrolls; keys zoom about the pointer,
// and 1 shows the real pixels.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { pictureFit, realZoom, zoomAnchor } from '../renderer/src/artifact-pins.ts';

const box = { w: 1000, h: 700 };

describe('how a picture opens', () => {
  it('a full-page screenshot fills the width and scrolls, instead of 8%', () => {
    const fit = pictureFit({ w: 1440, h: 9000 }, box);
    expect(fit.tall).toBe(true);
    expect(fit.scale).toBeCloseTo(1000 / 1440);
  });

  it('a phone picture opens whole at a readable size, not 45%', () => {
    // Not at its own size: at 100% its foot was out of reach.
    const fit = pictureFit({ w: 390, h: 844 }, box);
    expect(fit.tall).toBe(false);
    expect(fit.scale).toBeGreaterThan(0.8);
  });

  it('a wide picture still fits whole', () => {
    expect(pictureFit({ w: 1600, h: 1000 }, box)).toMatchObject({ scale: 0.625, tall: false });
  });

  it('a picture a little taller than the box but still wide on screen fits whole', () => {
    // Fitted by height it is 61% of the width: readable, so it is not a strip.
    const fit = pictureFit({ w: 610, h: 700 }, box);
    expect(fit.tall).toBe(false);
    expect(fit.scale).toBe(1);
    const squeezed = pictureFit({ w: 1220, h: 1400 }, box);
    expect(squeezed).toMatchObject({ scale: 0.5, tall: false });
  });

  it('just under that, it is a strip, and fits the width', () => {
    const fit = pictureFit({ w: 1180, h: 1400 }, box);
    expect(fit.tall).toBe(true);
    expect(fit.scale).toBeCloseTo(1000 / 1180);
  });

  it('a small picture that fits is never called tall nor blown up', () => {
    expect(pictureFit({ w: 200, h: 600 }, box)).toMatchObject({ scale: 1, tall: false });
  });

  it('draws nothing broken before the picture has a size', () => {
    expect(pictureFit({ w: 0, h: 0 }, box)).toMatchObject({ scale: 1, tall: false });
  });
});

describe('the key for real pixels', () => {
  it('goes from fitted to 100%', () => {
    expect(realZoom(0.5)).toBe(2);
  });
  it('stays put on a picture already at its own size', () => {
    expect(realZoom(1)).toBe(1);
  });
});

describe('where a key zooms', () => {
  const pic = { left: 0, top: -300, w: 1000, h: 6250 };
  it('about the pointer, when it is on the view', () => {
    const a = zoomAnchor(null, box, pic, { x: 100, y: 200 });
    expect(a).toMatchObject({ x: 100, y: 200 });
    expect(a.fx).toBeCloseTo(0.1);
    expect(a.fy).toBeCloseTo(500 / 6250);
  });
  it('about the pointer over the pin in hand, since that is where the eye is', () => {
    expect(zoomAnchor({ x: 0.9, y: 0.9 }, box, pic, { x: 100, y: 200 })).toMatchObject({ x: 100, y: 200 });
  });
  it('about the middle when the pointer is off the view, as the buttons do', () => {
    expect(zoomAnchor(null, box, pic, { x: -5, y: 200 })).toMatchObject({ x: 500, y: 350 });
    expect(zoomAnchor(null, box, pic)).toMatchObject({ x: 500, y: 350 });
  });
});

describe('the wiring', () => {
  const stage = fs.readFileSync(new URL('../renderer/src/components/ArtifactStage.tsx', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../renderer/src/components/artifact-view.css', import.meta.url), 'utf8');
  it('the stage opens by pictureFit and scrolls a tall picture', () => {
    expect(stage).toMatch(/pictureFit\(natural, size\)/);
    expect(stage).toContain('is-tall');
    expect(css).toMatch(/\.av-picture-box\.is-tall \{[^}]*overflow-y: auto/);
  });
  it('the keys zoom about the pointer, and 1 is real pixels', () => {
    expect(stage).toMatch(/e\.key === '1'/);
    expect(stage).toMatch(/pointerAt\.current/);
  });
});
