// A LONG PDF DREW EVERY PAGE THE MOMENT IT OPENED, AND AGAIN ON EVERY RESIZE.
// Each page was drawn at the pane's full width as soon as the file opened.
// Measured with the real PdfPages in Chromium at 2x on an 80-page PDF: 1,857 MB
// of page images, the app blocked for 0.75 s on opening, and 1.3 s more each
// time the pane's width changed, because every page was drawn again. A long
// PDF open in the app could make the whole computer lag.
// Now a page takes its room at once but is drawn only when it comes near the
// screen, is let go of once it is far behind, and on a resize keeps its old
// drawing until the new one is ready.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium.executablePath());

const WORKER = readFileSync(require.resolve('pdfjs-dist/build/pdf.worker.min.mjs'));
const css = readFileSync(new URL('../renderer/src/components/file-views.css', import.meta.url), 'utf8');

let browser, bundle;
const pdfs: Record<string, Buffer> = {};

// A PDF of `n` pages with words on each, printed by Chromium itself.
async function makePdf(n: number, landscape = false) {
  const page = await browser.newPage();
  const words = 'Every page of this report carries enough words to leave ink where a test looks for it. ';
  await page.setContent(Array.from({ length: n }, (_, i) =>
    `<section style="page-break-after:always;font:22px/1.5 serif;padding:30px"><h1>Page ${i + 1}</h1><p>${words.repeat(12)}</p></section>`).join(''));
  const out = await page.pdf({ format: 'Letter', landscape });
  await page.close();
  return out;
}

beforeAll(async () => {
  if (!browserAvailable) return;
  bundle = (await build({
    stdin: { contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { PdfPages } from './renderer/src/components/PdfPages';
      window.mount = ({ file, fit }) => {
        const load = async () => new Uint8Array(await (await fetch('/' + file)).arrayBuffer());
        createRoot(document.getElementById('root')).render(
          <div id="frame" style={{ height: 600, width: 900, display: 'flex', flexDirection: 'column' }}>
            <PdfPages load={load} name={file} fit={fit} />
          </div>);
      };`,
      resolveDir: process.cwd(), loader: 'tsx',
    },
    bundle: true, write: false, format: 'iife', jsx: 'automatic',
    loader: { '.css': 'empty', '.svg': 'empty', '.png': 'empty' },
    define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' },
    plugins: [{
      name: 'worker-url',
      setup(b) {
        b.onResolve({ filter: /\?url$/ }, (a) => ({ path: a.path, namespace: 'worker-url' }));
        b.onLoad({ filter: /.*/, namespace: 'worker-url' }, () => ({ contents: 'export default "/pdf.worker.min.mjs";', loader: 'js' }));
      },
    }],
  })).outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
  pdfs['long.pdf'] = await makePdf(40);
  pdfs['short.pdf'] = await makePdf(2);
  pdfs['deck.pdf'] = await makePdf(40, true);
}, 120_000);
afterAll(async () => { await browser?.close(); });

async function open(file: string, { fit = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 2 });
  await page.route('http://pdf.test/**', (route) => {
    const name = new URL(route.request().url()).pathname.slice(1);
    if (name === 'pdf.worker.min.mjs') return route.fulfill({ contentType: 'text/javascript', body: WORKER });
    if (pdfs[name]) return route.fulfill({ contentType: 'application/pdf', body: pdfs[name] });
    return route.fulfill({ contentType: 'text/html', body: `<style>${css}</style><div id="root"></div>` });
  });
  await page.goto('http://pdf.test/');
  await page.addScriptTag({ content: bundle });
  await page.evaluate((o) => window.mount(o), { file, fit });
  await page.waitForFunction(() => document.querySelectorAll('.pdf-pages .pdf-page canvas').length > 0 && [...document.querySelectorAll('.pdf-pages .pdf-page canvas')].some((c) => c.width > 0));
  await page.waitForTimeout(1200);
  return page;
}

// Every page in the scroller: whether it has a drawing, its size on screen, and whether it has ink.
const pages = (page) => page.evaluate(() => [...document.querySelectorAll('.pdf-pages .pdf-page canvas')].map((c: HTMLCanvasElement) => {
  let ink = false;
  if (c.width > 0) {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, Math.min(c.height, 400)).data;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 128 && d[i + 3] > 0) { ink = true; break; }
  }
  const r = c.getBoundingClientRect();
  return { drawn: c.width > 0, bitmap: c.width, w: Math.round(r.width), h: Math.round(r.height), ink };
}));

describe.skipIf(!browserAvailable)('a long PDF', () => {
  it('opens with only the pages near the screen drawn, and every page already taking its room (the reported case)', async () => {
    const page = await open('long.pdf');
    const all = await pages(page);
    expect(all).toHaveLength(40);
    const drawn = all.filter((p) => p.drawn);
    expect(drawn.length).toBeGreaterThan(0);
    expect(drawn.length).toBeLessThanOrEqual(6);
    expect(all[0].ink).toBe(true);
    // The pages not drawn yet are already the size they will be drawn at.
    for (const p of all) expect(Math.abs(p.h - all[0].h)).toBeLessThanOrEqual(1);
    await page.close();
  }, 60_000);

  it('draws a page as it is scrolled to, and lets go of the pages far behind', async () => {
    const page = await open('long.pdf');
    await page.evaluate(() => document.querySelectorAll('.pdf-pages .pdf-page')[29].scrollIntoView({ block: 'start' }));
    await page.waitForFunction(() => (document.querySelectorAll('.pdf-pages .pdf-page canvas')[29] as HTMLCanvasElement).width > 0);
    await page.waitForTimeout(600);
    const all = await pages(page);
    expect(all[29].ink).toBe(true);
    expect(all[0].drawn).toBe(false);
    expect(all.filter((p) => p.drawn).length).toBeLessThanOrEqual(8);
    await page.close();
  }, 60_000);

  it('keeps its drawing through a resize, then draws again at the new width', async () => {
    const page = await open('long.pdf');
    const before = (await pages(page))[0];
    await page.evaluate(() => { (document.getElementById('frame') as HTMLElement).style.width = '700px'; });
    await page.waitForTimeout(40);
    const during = (await pages(page))[0];
    // The old drawing, stretched to the new size, rather than a cleared page waiting to be drawn.
    expect(during.w).toBeLessThan(before.w);
    expect(during.bitmap).toBe(before.bitmap);
    expect(during.ink).toBe(true);
    await page.waitForFunction((w) => (document.querySelector('.pdf-pages .pdf-page canvas') as HTMLCanvasElement).width !== w, before.bitmap);
    const after = (await pages(page))[0];
    expect(after.bitmap).toBe(Math.round(after.w * 2));
    expect(after.ink).toBe(true);
    await page.close();
  }, 60_000);
});

describe.skipIf(!browserAvailable)('a short PDF', () => {
  it('has both pages drawn when both are near the screen, as before', async () => {
    const page = await open('short.pdf');
    const all = await pages(page);
    expect(all).toHaveLength(2);
    expect(all.every((p) => p.drawn && p.ink)).toBe(true);
    await page.close();
  }, 60_000);
});

describe.skipIf(!browserAvailable)('a deck of slides', () => {
  it('draws the slides in its strip only near where the strip shows', async () => {
    const page = await open('deck.pdf', { fit: true });
    const thumbs = await page.evaluate(() => [...document.querySelectorAll('.deck-strip canvas')].map((c: HTMLCanvasElement) => c.width > 0));
    expect(thumbs).toHaveLength(40);
    expect(thumbs[0]).toBe(true);
    expect(thumbs[39]).toBe(false);
    await page.close();
  }, 60_000);
});
