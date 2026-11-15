// A TALL PICTURE CAN BE READ, ZOOMED OUT AND SCROLLED IN EVERY PICTURE VIEW.
//
// Sofia and Dev: onboarding-b-step1-390-after.png opened at 100%,
// Zoom out was greyed, and the bottom (the Step 2 link, Copy link) sat off the
// window under the zoom bar. Measured with the viewer's own sum: a 390 x 844
// phone shot in a 1000 x 700 box was "tall", fitted to its width at 1, and zoom
// could not go below 1, so 144px of it could never be seen. The thread's
// full-screen viewer fitted it whole instead, by another rule. Now one rule
// opens both: a phone screenshot that fits whole at a readable size fits whole,
// a longer one fits the width and scrolls, zoom out always reaches the whole
// picture, and the scroll room clears the zoom bar.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { pictureFit, lowestZoom, zoomBy, pinchTo, panLimits } from '../renderer/src/picture-view';
import { nextZoom, wheelZoom } from '../renderer/src/artifact-pins';

const box = { w: 1000, h: 700 };

describe('how a tall picture opens', () => {
  it('a phone screenshot that fits whole at a readable size fits whole', () => {
    const fit = pictureFit({ w: 390, h: 844 }, box);
    expect(fit.tall).toBe(false);
    expect(fit.scale).toBeCloseTo(700 / 844);
  });

  it('a retina phone screenshot fits whole too, drawn wider than a strip', () => {
    const fit = pictureFit({ w: 1170, h: 2532 }, box);
    expect(fit.tall).toBe(false);
    expect(1170 * fit.scale).toBeGreaterThanOrEqual(300);
  });

  it('the same phone shot in a pane too short to read it whole fits the width and scrolls', () => {
    const fit = pictureFit({ w: 390, h: 844 }, { w: 520, h: 420 });
    expect(fit.tall).toBe(true);
    expect(fit.scale).toBe(1);
  });

  it('a long phone page is not phone-shaped: it fits the width and scrolls', () => {
    const fit = pictureFit({ w: 390, h: 1400 }, box);
    expect(fit.tall).toBe(true);
    expect(fit.scale).toBe(1);
    expect(fit.whole).toBeCloseTo(0.5);
  });

  it('a full-page desktop screenshot still fits the width', () => {
    const fit = pictureFit({ w: 1440, h: 9000 }, box);
    expect(fit.tall).toBe(true);
    expect(fit.scale).toBeCloseTo(1000 / 1440);
  });

  it('a wide picture is left whole', () => {
    expect(pictureFit({ w: 1600, h: 1000 }, box)).toMatchObject({ scale: 0.625, tall: false });
  });
});

describe('zoom out reaches the whole picture', () => {
  it('from a tall picture fitted to its width', () => {
    const fit = pictureFit({ w: 390, h: 1400 }, box);
    const floor = lowestZoom(fit);
    expect(floor).toBeCloseTo(0.5);
    expect(nextZoom(1, -1, floor)).toBeCloseTo(floor);
    expect(nextZoom(floor, -1, floor)).toBeCloseTo(floor);
    expect(wheelZoom(1, 500, floor)).toBeCloseTo(floor);
    expect(zoomBy(1, 0.1, floor)).toBeCloseTo(floor);
  });

  it('a picture that already opens whole goes no lower', () => {
    const fit = pictureFit({ w: 1600, h: 1000 }, box);
    expect(lowestZoom(fit)).toBe(1);
    expect(nextZoom(1, -1, lowestZoom(fit))).toBe(1);
  });

  it('a pinch in on a tall picture goes down to whole, and no further', () => {
    const start = { distance: 200, zoom: 1, pan: { x: 0, y: 0 }, mid: { x: 0, y: 0 } };
    expect(pinchTo(start, 20, { x: 0, y: 0 }, 0.5).zoom).toBe(0.5);
    expect(pinchTo(start, 20, { x: 0, y: 0 }).zoom).toBe(1);
  });
});

describe('the full-screen viewer reaches every part', () => {
  it('a tall picture can be panned from its top to its bottom, and not past', () => {
    const lim = panLimits({ w: 390, h: 1400 }, 1, box);
    expect(lim.y).toBe(350);
    expect(lim.x).toBe(0);
  });
  it('a picture that fits has nowhere to pan', () => {
    expect(panLimits({ w: 390, h: 600 }, 1, box)).toEqual({ x: 0, y: 0 });
  });
});

describe('the wiring', () => {
  const stage = fs.readFileSync(new URL('../renderer/src/components/ArtifactStage.tsx', import.meta.url), 'utf8');
  const view = fs.readFileSync(new URL('../renderer/src/components/PictureView.tsx', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../renderer/src/components/artifact-view.css', import.meta.url), 'utf8');
  it('both views open by the one rule', () => {
    expect(stage).toMatch(/pictureFit\(natural, size\)/);
    expect(view).toMatch(/pictureFit\(natural, box\)/);
    expect(view).not.toMatch(/fitScale\(/);
  });
  it('zoom out is greyed only at the whole picture', () => {
    expect(stage).toMatch(/disabled=\{zoom <= floor/);
  });
  it('the arrow and page keys scroll a tall picture in both', () => {
    expect(stage).toMatch(/PageDown/);
    expect(view).toMatch(/PageDown/);
  });
  it('a tall picture scrolls clear of the zoom bar', () => {
    expect(css).toMatch(/\.av-picture-box\.is-tall \{[^}]*padding-bottom: 72px/);
  });
});
