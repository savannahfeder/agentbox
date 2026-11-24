// A SKY GIVES BACK ITS DRAWING MEMORY.
//
// On the Nov 23 onboarding call a new person's window went black in patches
// that grew until all of it was black, and a modal opened with nothing in it:
// Chromium dropping parts of a window it has no graphics memory left to draw.
// Measured on the cloud at a 5K screen (2560x1440 points) in the dark orange
// sky, through the first run: the canvases on the page held 25 to 53 MB, while
// Chromium's canvas memory held 103 to 258 MB, growing screen by screen. The
// sky cache kept full-size copies of the last three skies (55 MB each at 5K),
// every light sky threw away a full-size scratch canvas, and each sky taken off
// the page kept its drawing until garbage collection.
//
// Measured here by drawing the real skies in Chromium at that size.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium.executablePath());

let browser, bundle;
beforeAll(async () => {
  if (!browserAvailable) return;
  bundle = (await build({
    stdin: { contents: `
      import React from 'react';
      import { flushSync } from 'react-dom';
      import { createRoot } from 'react-dom/client';
      import { SKY_THEMES, drawSky, paintSky, skyCacheBytes } from './renderer/src/home/sky';
      import { SkyBackdrop } from './renderer/src/home/SkyBackdrop';
      import { InboxSky } from './renderer/src/home/InboxSky';
      import { WelcomeSky } from './renderer/src/components/WelcomeSky';
      const art = (id) => SKY_THEMES.find((s) => s.id === id).art;
      const canvasOf = (w, h) => { const c = document.createElement('canvas'); c.style.cssText = 'position:absolute;left:0;top:0;width:' + w + 'px;height:' + h + 'px'; document.body.appendChild(c); return c; };
      window.paintEach = (ids, w, h) => { for (const id of ids) paintSky(canvasOf(w, h), art(id), { from: 40, span: 300, dpr: 2 }); return skyCacheBytes(); };
      window.scratchLeft = (id) => {
        const c = canvasOf(1440, 900);
        const made = [];
        const make = document.createElement.bind(document);
        document.createElement = (tag, o) => { const el = make(tag, o); if (tag === 'canvas') made.push(el); return el; };
        drawSky(c, art(id), { from: 40, span: 300, dpr: 2 });
        document.createElement = make;
        return made.filter((m) => m.width * m.height > 0).length;
      };
      window.mountAndTakeDown = async (which) => {
        const host = document.createElement('div');
        host.className = 'app workspace-layout';
        host.style.cssText = 'position:absolute;left:0;top:0;width:1440px;height:900px';
        document.body.appendChild(host);
        const root = createRoot(host.appendChild(document.createElement('div')));
        const el = which === 'home' ? <SkyBackdrop art={art('ember')} /> : which === 'inbox' ? <InboxSky art={art('ember')} /> : <WelcomeSky dark />;
        flushSync(() => root.render(el));
        await new Promise((r) => setTimeout(r, 600));
        const canvases = [...document.querySelectorAll('canvas')].filter((c) => host.contains(c));
        const drawn = canvases.filter((c) => c.width * c.height > 0).length;
        flushSync(() => root.unmount());
        return { drawn, left: canvases.filter((c) => c.width * c.height > 0).length };
      };`,
    resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', logLevel: 'error',
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'empty', '.mp3': 'empty' },
  })).outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
}, 60_000);
afterAll(async () => { await browser?.close(); });

async function page() {
  const p = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
  p.setDefaultTimeout(20_000);
  await p.route('http://sky.test/**', (r) => r.fulfill({ contentType: 'text/html', body: '<html><body style="margin:0"></body></html>' }));
  await p.goto('http://sky.test/');
  await p.addScriptTag({ content: bundle });
  return p;
}
const MB = 1048576;

describe.skipIf(!browserAvailable)('a sky', () => {
  it('keeps at most one full-size copy of a 5K sky for its next visit', async () => {
    const p = await page();
    const kept = await p.evaluate(() => (window as unknown as { paintEach: (ids: string[], w: number, h: number) => number }).paintEach(['ember', 'dusk', 'aurora', 'sage'], 2560, 1440));
    expect(kept).toBeGreaterThan(0);
    expect(kept / MB).toBeLessThanOrEqual(5120 * 2880 * 4 / MB);
    await p.close();
  });

  it('still keeps two laptop-sized skies, so going back to Home is not drawn again', async () => {
    const p = await page();
    const kept = await p.evaluate(() => (window as unknown as { paintEach: (ids: string[], w: number, h: number) => number }).paintEach(['ember', 'dusk', 'aurora'], 1440, 900));
    expect(kept).toBe(2 * 2880 * 1800 * 4);
    await p.close();
  });

  it('lets its scratch canvas go once it is drawn', async () => {
    const p = await page();
    expect(await p.evaluate(() => (window as unknown as { scratchLeft: (id: string) => number }).scratchLeft('sage'))).toBe(0);
    await p.close();
  });

  for (const which of ['home', 'inbox', 'welcome']) {
    it(`behind ${which} hands its drawing back when it leaves the page`, async () => {
      const p = await page();
      const { drawn, left } = await p.evaluate((w) => (window as unknown as { mountAndTakeDown: (w: string) => Promise<{ drawn: number; left: number }> }).mountAndTakeDown(w), which);
      expect(drawn).toBeGreaterThan(0);
      expect(left).toBe(0);
      await p.close();
    });
  }
});
