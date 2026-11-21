// THE SKY STAYS PUT WHILE THE SIDEBAR OPENS OVER IT (w-07de09be0f, 2026-11-21).
//
// The sky on Home and the Inbox is a field of dots drawn one by one, and it was
// drawn again for the card's new width on every frame of the sidebar sliding
// open: 150 to 240 ms a frame on Home in Chromium at 1710x1063, so the slide
// showed about five frames a second ("it feels like it's going at 5 frames per
// second"). Each new width also gave the streak different wiggles, so drawing
// it again once the slide ended made the sky jump. It is now drawn once, as
// wide as the card with the sidebar folded, and pinned to the card's right
// edge, so the sidebar opening slides the card's edge over it. A new size of
// the card itself still draws it again, once the card has held still.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import type { Page } from 'playwright';

type Browser = { newPage: (o?: object) => Promise<Page>; close: () => Promise<void> };
let chromium: { launch: (o: object) => Promise<Browser>; executablePath: () => string } | undefined;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch { /* no browser here */ }
const can = !!chromium && existsSync(chromium.executablePath());

const homeCss = readFileSync(new URL('../renderer/src/home/home.css', import.meta.url), 'utf8');

// The window as workspace-navigation.css and the rail's rules lay it out: the
// card's left edge is 82px with the sidebar folded and 246px open, and both the
// page's padding and the card's edge ease between them.
const PAGE = `<style>
  body { margin: 0; }
  .app.workspace-layout { --workspace-left: 82px; position: relative; box-sizing: border-box; width: 1400px; height: 800px;
    padding: 40px 22px 22px var(--workspace-left); transition: padding-left .24s cubic-bezier(.22, .61, .36, 1); }
  .app.workspace-layout.gt-rail-open { --workspace-left: 246px; }
  .app.workspace-layout::before { content: ''; position: absolute; top: 40px; bottom: 22px; left: var(--workspace-left); right: 22px;
    transition: left .24s cubic-bezier(.22, .61, .36, 1); }
  ${homeCss}
</style><div class="app workspace-layout workspace-collapsed"><div id="root"></div></div>`;

type Box = { left: number; right: number; width: number };
type Sky = { fills: number; canvas: Box; card: Box; url: string };

async function open(browser: Browser, keptOpen = false): Promise<Page> {
  const bundle = (await build({
    stdin: { contents: `
      import React from 'react';
      import { flushSync } from 'react-dom';
      import { createRoot } from 'react-dom/client';
      import { SkyBackdrop } from './renderer/src/home/SkyBackdrop';
      import { InboxSky } from './renderer/src/home/InboxSky';
      import { SKY_THEMES } from './renderer/src/home/sky';
      const w = window as unknown as Record<string, unknown>;
      const proto = CanvasRenderingContext2D.prototype;
      const fill = proto.fillRect;
      w.fills = 0;
      proto.fillRect = function (...a) { (w.fills as number)++; return fill.apply(this, a); };
      const root = createRoot(document.getElementById('root')!);
      const art = SKY_THEMES[1].art;
      w.show = (kind: 'home' | 'inbox' | null) => flushSync(() => root.render(
        kind === 'home' ? <SkyBackdrop art={art} from={40} span={300} /> : kind === 'inbox' ? <InboxSky art={art} /> : null));
      const box = (e: Element | null) => { const r = e!.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width }; };
      w.look = () => ({ fills: w.fills, canvas: box(document.querySelector('.home-sky canvas')), card: box(document.querySelector('.home-sky')),
        url: (document.querySelector('.home-sky canvas') as HTMLCanvasElement).toDataURL() });
      w.slide = (open: boolean) => { const app = document.querySelector('.app')!; app.classList.toggle('workspace-collapsed', !open); app.classList.toggle('gt-rail-open', open); };`,
    resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', logLevel: 'error',
  })).outputFiles[0].text;
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  // An address of its own, so the page has the storage the sidebar setting is kept in.
  await page.route('http://sky.test/', (route) => route.fulfill({ contentType: 'text/html', body: PAGE }));
  await page.goto('http://sky.test/');
  if (keptOpen) await page.evaluate(() => localStorage.setItem('agentbox.sidebarShrinks', '0'));
  await page.addScriptTag({ content: bundle });
  return page;
}
const show = (page: Page, kind: 'home' | 'inbox' | null) => page.evaluate((k) => (window as unknown as { show: (k: string | null) => void }).show(k), kind);
const look = (page: Page) => page.evaluate(() => (window as unknown as { look: () => Sky }).look());
const slide = (page: Page, isOpen: boolean) => page.evaluate((o) => (window as unknown as { slide: (o: boolean) => void }).slide(o), isOpen);
const zero = (page: Page) => page.evaluate(() => { (window as unknown as { fills: number }).fills = 0; });
// The slide's 240 ms, the sky's hold of 150 ms, and room for a slow machine.
const SETTLED = 900;

describe('the sky over the card, in Chromium', () => {
  for (const kind of ['home', 'inbox'] as const) {
    it.skipIf(!can)(`${kind}: opening and folding the sidebar draws no dot, and the sky does not move`, async () => {
      const browser = await chromium!.launch({ headless: true });
      try {
        const page = await open(browser);
        await show(page, kind);
        const folded = await look(page);
        expect(folded.fills).toBeGreaterThan(1000);

        await zero(page);
        await slide(page, true);
        await page.waitForTimeout(SETTLED);
        const opened = await look(page);
        expect(opened.fills).toBe(0);
        expect(opened.card.left - folded.card.left).toBeCloseTo(164, 0);
        expect(opened.canvas).toEqual(folded.canvas);
        expect(opened.url).toBe(folded.url);

        await slide(page, false);
        await page.waitForTimeout(SETTLED);
        const back = await look(page);
        expect(back.fills).toBe(0);
        expect(back.card).toEqual(folded.card);
        expect(back.canvas).toEqual(folded.canvas);
      } finally { await browser.close(); }
    }, 60_000);
  }

  it.skipIf(!can)('a sky put up with the sidebar open is the same drawing as with it folded', async () => {
    const browser = await chromium!.launch({ headless: true });
    try {
      const page = await open(browser);
      await show(page, 'home');
      const folded = await look(page);
      await show(page, null);
      await slide(page, true);
      await page.waitForTimeout(SETTLED);
      await zero(page);
      await show(page, 'home');
      const opened = await look(page);
      expect(opened.fills).toBe(0);
      expect(opened.url).toBe(folded.url);
      expect(opened.canvas).toEqual(folded.canvas);
    } finally { await browser.close(); }
  }, 60_000);

  it.skipIf(!can)('a card of a new size draws it again, once, after the card holds still', async () => {
    const browser = await chromium!.launch({ headless: true });
    try {
      const page = await open(browser);
      await show(page, 'home');
      await zero(page);
      await page.evaluate(() => { (document.querySelector('.app') as HTMLElement).style.width = '1300px'; });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      expect((await look(page)).fills).toBe(0);
      await page.waitForTimeout(SETTLED);
      const drawn = await look(page);
      expect(drawn.fills).toBeGreaterThan(1000);
      expect(drawn.canvas.width).toBe(drawn.card.width);
      await page.waitForTimeout(SETTLED);
      expect((await look(page)).fills).toBe(drawn.fills);
    } finally { await browser.close(); }
  }, 60_000);

  it.skipIf(!can)('with the sidebar kept open, the sky is drawn to fit the open card', async () => {
    const browser = await chromium!.launch({ headless: true });
    try {
      const page = await open(browser, true);
      await show(page, 'home');
      await zero(page);
      await slide(page, true);
      await page.waitForTimeout(SETTLED);
      const opened = await look(page);
      expect(opened.fills).toBeGreaterThan(1000);
      expect(opened.canvas).toEqual(opened.card);
    } finally { await browser.close(); }
  }, 60_000);
});
