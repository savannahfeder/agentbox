// A HARNESS LOGO SITS IN THE MIDDLE OF ITS TILE.
//
// Asked 2026-11-21 (w-8e34f549aa) with a close crop of the inbox: the Claude
// and OpenAI logos sat off centre in their tiles. Measured on the picture at
// 2x: 8 device pixels of tile left and above each logo, 6 right and below.
// The logos' own drawings are centred; the 11px logo sat 2.5px inside the
// tile's 16px and Chromium put it at 3. Measured here by painting each tile in
// Chromium at 2x and counting the tile left on every side of the logo.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HarnessMark } from '../renderer/src/components/EngineLogos.tsx';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium.executablePath());

const css = readFileSync(new URL('../renderer/src/components/harness-mark.css', import.meta.url), 'utf8');

let browser;
beforeAll(async () => { if (browserAvailable) browser = await chromium.launch({ headless: true }); }, 60_000);
afterAll(async () => { await browser?.close(); });

/** The tile's device pixels on each side of the logo's ink, painted at 2x on the dark page. */
async function margins(engine: string) {
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  await page.setContent(`<style>:root { --text: #ece9e5; } body { margin: 0; padding: 10px; background: #201e1c; } ${css}</style>${renderToStaticMarkup(React.createElement(HarnessMark, { engine }))}`);
  const shot = (await page.locator('.harness-mark').screenshot()).toString('base64');
  const found = await page.evaluate(async ({ shot, orange }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${shot}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const px = g.getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, x1 = -1, y0 = c.height, y1 = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      const ink = orange ? px[i] - px[i + 2] > 60 : (px[i] + px[i + 1] + px[i + 2]) / 3 > 150;
      if (ink) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    return { size: c.width, x0, x1, y0, y1 };
  }, { shot, orange: engine === 'claude' });
  await page.close();
  return { left: found.x0, right: found.size - 1 - found.x1, top: found.y0, bottom: found.size - 1 - found.y1, wide: found.x1 - found.x0 + 1, tall: found.y1 - found.y0 + 1 };
}

describe.skipIf(!browserAvailable)('a harness logo in its tile, at 2x', () => {
  for (const engine of ['claude', 'codex']) {
    it(`leaves as much tile left of the ${engine} logo as right of it, and above as below`, async () => {
      const m = await margins(engine);
      expect(Math.abs(m.left - m.right)).toBeLessThanOrEqual(1);
      expect(Math.abs(m.top - m.bottom)).toBeLessThanOrEqual(1);
    });

    // THE SIZE THAT WAS APPROVED: 11px, 22 device pixels, in an 18px tile.
    it(`keeps the ${engine} logo the size that was approved`, async () => {
      const m = await margins(engine);
      expect(m.wide).toBeGreaterThanOrEqual(21);
      expect(m.wide).toBeLessThanOrEqual(23);
      expect(m.tall).toBeGreaterThanOrEqual(21);
      expect(m.tall).toBeLessThanOrEqual(23);
    });
  }
});
