// GOING BACK TO HOME DOES NOT DRAW ITS SKY AGAIN.
//
// Home's sky and the Inbox's are dot fields drawn cell by cell, three pixels
// apart, across the whole card: about 170,000 fillRects for a 1440x900 window.
// They were drawn from nothing every time the page mounted, inside the layout
// effect, so every click on Home or Inbox held its first frame for the draw.
// Profiled in Chromium with the built renderer: drawSky took 88-95 ms of a
// 137 ms Home click.
//
// A sky already drawn for the same art at the same size is copied from the
// last draw instead (one drawImage). A new size or new art still draws.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const read = (f: string) => readFileSync(new URL(`../renderer/src/${f}`, import.meta.url), 'utf8');

describe('the skies over the app', () => {
  for (const f of ['home/SkyBackdrop.tsx', 'home/InboxSky.tsx']) {
    it(`${f} paints through the kept copy`, () => {
      const text = read(f);
      expect(text).toMatch(/paintSky\(/);
      expect(text).not.toMatch(/\bdrawSky\(/);
    });
  }
});

let chromium: { launch: (o: object) => Promise<{ newPage: (o?: object) => Promise<import('playwright').Page>; close: () => Promise<void> }>; executablePath: () => string } | undefined;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch { /* no browser here */ }
const can = !!chromium && existsSync(chromium.executablePath());

describe('in Chromium', () => {
  it.skipIf(!can)('the second mount copies the sky, and a new size or new art draws it', async () => {
    const bundle = (await build({
      stdin: { contents: `
        import React from 'react';
        import { flushSync } from 'react-dom';
        import { createRoot } from 'react-dom/client';
        import { SkyBackdrop } from './renderer/src/home/SkyBackdrop';
        import { SKY_THEMES } from './renderer/src/home/sky';
        const w = window as unknown as Record<string, unknown>;
        const proto = CanvasRenderingContext2D.prototype;
        const fill = proto.fillRect;
        w.fills = 0;
        proto.fillRect = function (...a) { (w.fills as number)++; return fill.apply(this, a); };
        const root = createRoot(document.getElementById('root')!);
        w.show = (i: number | null) => {
          w.fills = 0;
          const t0 = performance.now();
          flushSync(() => root.render(i === null ? null : <SkyBackdrop art={SKY_THEMES[i].art} from={40} span={300} />));
          return { fills: w.fills, ms: performance.now() - t0, url: (document.querySelector('.home-sky canvas') as HTMLCanvasElement | null)?.toDataURL() ?? null };
        };`,
      resolveDir: process.cwd(), loader: 'tsx' },
      bundle: true, write: false, format: 'iife', jsx: 'automatic', logLevel: 'error',
    })).outputFiles[0].text;
    const browser = await chromium!.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.setContent(`<style>
        .app.workspace-layout { position: relative; width: 1200px; height: 800px; }
        .app.workspace-layout::before { content: ''; position: absolute; left: 10px; top: 10px; right: 10px; bottom: 10px; }
        .home-sky { position: absolute; } .home-sky canvas { display: block; width: 100%; height: 100%; }
      </style><div class="app workspace-layout"><div id="root"></div></div>`);
      await page.addScriptTag({ content: bundle });
      type Shown = { fills: number; ms: number; url: string | null };
      const show = (i: number | null) => page.evaluate((n) => (window as unknown as { show: (i: number | null) => Shown }).show(n), i);

      const first = await show(0);
      expect(first.fills).toBeGreaterThan(10_000);
      await show(null);
      const again = await show(0);
      expect(again.fills).toBe(0);
      expect(again.url).toBe(first.url);

      await show(null);
      const other = await show(1);
      expect(other.fills).toBeGreaterThan(10_000);
      expect(other.url).not.toBe(first.url);

      await show(null);
      await page.evaluate(() => { (document.querySelector('.app') as HTMLElement).style.width = '1000px'; });
      const resized = await show(0);
      expect(resized.fills).toBeGreaterThan(10_000);
    } finally { await browser.close(); }
  }, 60_000);
});
