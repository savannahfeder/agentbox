// The zoom has to say what it did.
//
// Nothing was broken; no readout had ever been built.
//
// The number is executed for real below. The wiring between main, preload and
// the page is asserted against source, for the same reason the chord test does
// it: this suite cannot boot the main process, and launching a second Electron
// is barred (reference/shooting-the-real-app.md).

import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zoomPercentFor } from '../main/zoom-readout.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(here, '..', ...p), 'utf8');
const menu = read('main', 'menu.mjs');
const preload = read('preload.cjs');
const app = read('renderer', 'src', 'App.tsx');
const component = read('renderer', 'src', 'components', 'ZoomPercent.tsx');
const css = read('renderer', 'src', 'styles.css');

describe('the number itself', () => {
  it('says 100% at actual size', () => {
    expect(zoomPercentFor(0)).toBe(100);
  });

  // Her window, measured out of Chromium's own profile at 12:06 on 08-14.
  it('says 120% at the level her window has been sitting on', () => {
    expect(zoomPercentFor(1)).toBe(120);
  });

  // The chords step by 0.5, and Chromium's factor is 1.2 ** level, so this is
  // the whole ladder either side of normal. It is not the round ladder other
  // apps use; moving it was offered on and she did not ask for it.
  it('reads out her real ladder, not a rounded-off one', () => {
    expect([-1.5, -1, -0.5, 0, 0.5, 1].map(zoomPercentFor)).toEqual([76, 83, 91, 100, 110, 120]);
  });

  it('has no readout for a level that is not a number', () => {
    expect(zoomPercentFor(null)).toBeNull();
    expect(zoomPercentFor(undefined)).toBeNull();
    expect(zoomPercentFor(NaN)).toBeNull();
    expect(zoomPercentFor('1')).toBeNull();
  });
});

// The level that moves is the one applyZoom just set, so the readout is read
// back off the contents rather than predicted from the delta. That also makes
// the clamp at ±6 tell the truth: at the end of the ladder the number stops.
describe('what the page is told', () => {
  const fakeContents = (level) => ({
    level,
    sent: [],
    isDestroyed: () => false,
    getZoomLevel() { return this.level; },
    setZoomLevel(next) { this.level = next; },
    send(channel, payload) { this.sent.push([channel, payload]); },
  });

  const withElectron = async (inbox) => {
    vi.resetModules();
    vi.doMock('electron', () => ({
      app: { name: 'Zero' },
      Menu: { buildFromTemplate: () => ({}), setApplicationMenu: () => {} },
      webContents: { getFocusedWebContents: () => null },
      BrowserWindow: {
        getFocusedWindow: () => null,
        getAllWindows: () => [{ isDestroyed: () => false, webContents: inbox }],
      },
    }));
    return (await import('../main/menu.mjs')).applyZoom;
  };

  it('sends the percentage after every step, including back to 100', async () => {
    const inbox = fakeContents(1);
    const applyZoom = await withElectron(inbox);

    applyZoom(0.5);
    applyZoom(-0.5);
    applyZoom(0);

    expect(inbox.sent.map(([channel]) => channel)).toEqual(
      ['zero:zoom-percent', 'zero:zoom-percent', 'zero:zoom-percent'],
    );
    expect(inbox.sent.map(([, payload]) => payload.percent)).toEqual([131, 120, 100]);

    vi.doUnmock('electron');
    vi.resetModules();
  });

  // A zoom inside the junk browser moves the guest's level, and the guest has
  // no readout of its own. The number belongs in her window's corner either way.
  it('goes to the app window even when the guest page is what zoomed', async () => {
    const inbox = fakeContents(0);
    const applyZoom = await withElectron(inbox);
    const guest = fakeContents(0);

    applyZoom(0.5, guest);

    expect(guest.level).toBe(0.5);
    expect(guest.sent).toEqual([]);
    expect(inbox.sent).toEqual([['zero:zoom-percent', { percent: 110 }]]);

    vi.doUnmock('electron');
    vi.resetModules();
  });
});

describe('the readout reaches the page', () => {
  it('is bridged, because the chords are caught in the main process', () => {
    expect(preload).toMatch(/onZoomPercent:/);
    expect(preload).toMatch(/ipcRenderer\.on\('zero:zoom-percent', handler\)/);
    expect(preload).toMatch(/removeListener\('zero:zoom-percent', handler\)/);
  });

  it('is drawn, at the top level, over whatever else is on screen', () => {
    expect(app).toMatch(/import \{ ZoomPercent \} from '\.\/components\/ZoomPercent'/);
    expect(app).toMatch(/<ZoomPercent \/>/);
    expect(component).toMatch(/onZoomPercent/);
  });
});

describe('what she asked for and nothing else', () => {
  it('is the number and the percent sign, with no hint text beside it', () => {
    // The drawing she turned down read "91%" and then the chord to get back to
    // normal. Only the markup is read here: the file's comments quote her.
    const markup = component.slice(component.indexOf('return <div'));
    expect(markup).toMatch(/>\{shown\.percent\}%<\/div>/);
    expect(markup).not.toMatch(/100%/);
    expect(markup).not.toMatch(/⌘/);
  });

  it('sits in the corner, in the strip above the tab row', () => {
    const rule = css.slice(css.indexOf('.zoom-readout {'), css.indexOf('.zoom-readout.up'));
    expect(rule).toMatch(/position: fixed/);
    expect(rule).toMatch(/right: 22px/);
    expect(rule).not.toMatch(/left:/);
    expect(rule).not.toMatch(/bottom:/);

    const top = Number(rule.match(/top: (\d+)px/)[1]);
    const topbar = css.slice(css.indexOf('.topbar {'), css.indexOf('.topbar button'));
    const stripHeight = Number(topbar.match(/padding: (\d+)px/)[1]);
    expect(top).toBeLessThan(stripHeight);
  });

  // It passes over the strip she drags the window by, so it must not steal
  // that strip for the second it is up.
  it('leaves the window draggable underneath it', () => {
    const rule = css.slice(css.indexOf('.zoom-readout {'), css.indexOf('.zoom-readout.up'));
    expect(rule).toMatch(/-webkit-app-region: drag/);
  });

  it('goes on its own, and cannot be clicked while it is there', () => {
    expect(component).toMatch(/setTimeout\(\(\) => setUp\(false\), HOLD_MS\)/);
    const rule = css.slice(css.indexOf('.zoom-readout {'), css.indexOf('.zoom-readout.up'));
    expect(rule).toMatch(/pointer-events: none/);
    expect(rule).toMatch(/opacity: 0/);
  });

  // A second press while the first is still up must restart the clock, or the
  // first press's timer hides a number she has only just changed again.
  it('restarts its clock when she keeps pressing', () => {
    expect(component).toMatch(/stamp: \+\+stamp/);
    expect(component).toMatch(/\}, \[shown\]\)/);
  });
});
