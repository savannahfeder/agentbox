// A PICTURE NOT YET ON ITS WAY DOES NOT SHIMMER.
//
// "Scrolling is so slow that it's constantly slowing down" on a thread of 86
// screenshots (w-47c0223d60, 2026-11-22). A picture is fetched only once it
// comes within a screen of view, and until then its place held a shimmering
// box, so every picture further away shimmered for as long as the thread was
// open. The shimmer moves a background, which the window restyles and repaints
// every frame. Measured in the built app's browser copy, a thread of 32
// screenshots with 28 still waiting, nobody touching it: the window's thread
// was busy 13.2% of the time, and 0.2% with those shimmers stopped.
//
// Rendered here with the app's own styles: the boxes near the view shimmer,
// the ones further away hold their place still, and a far one shimmers once
// scrolling brings it near.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium.executablePath());

const css = readFileSync(new URL('../renderer/src/styles.css', import.meta.url), 'utf8');
const PICTURES = 10;

let browser, bundle;
beforeAll(async () => {
  if (!browserAvailable) return;
  bundle = (await build({
    stdin: { contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { FittedImg } from './renderer/src/components/FittedImg';
      createRoot(document.getElementById('root')).render(
        <>{Array.from({ length: ${PICTURES} }, (_, i) => <FittedImg key={i} className="inline-image" src={'http://thread.test/' + i + '.png'} alt="" />)}</>);`,
    resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', logLevel: 'error',
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'empty' },
  })).outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
}, 60_000);
afterAll(async () => { await browser?.close(); });

// Every picture's bytes never come, so a box that started stays on its way.
async function thread() {
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  await page.route('http://thread.test/**', (r) => (r.request().url().endsWith('.png')
    ? undefined
    : r.fulfill({ contentType: 'text/html', body: `<html data-theme="dark"><style>${css}</style>
        <div id="scroll" style="height:800px;width:760px;overflow-y:auto"><div id="root"></div></div></html>` })));
  await page.goto('http://thread.test/');
  await page.addScriptTag({ content: bundle });
  await page.waitForFunction((n) => document.querySelectorAll('.inline-image.arriving').length === n, PICTURES);
  await page.waitForTimeout(300);
  return page;
}
const shimmers = (page) => page.evaluate(() => [...document.querySelectorAll('.inline-image.arriving')]
  .map((el) => getComputedStyle(el).animationName));

describe.skipIf(!browserAvailable)('a thread of pictures still to come', () => {
  it('shimmers only the boxes within a screen of view', async () => {
    const page = await thread();
    const now = await shimmers(page);
    // 760 wide at 4:3 is 570 tall: boxes 0 to 2 start within 800 of the 800-tall view.
    expect(now.slice(0, 3)).toEqual(['phone-shimmer', 'phone-shimmer', 'phone-shimmer']);
    expect(now.slice(3)).toEqual(Array(PICTURES - 3).fill('none'));
    await page.close();
  });

  it('holds a far box at the size it will have while it is still', async () => {
    const page = await thread();
    const sizes = await page.evaluate(() => [...document.querySelectorAll('.inline-image.arriving')]
      .map((el) => [Math.round(el.getBoundingClientRect().width), Math.round(el.getBoundingClientRect().height)]));
    expect(new Set(sizes.map(String))).toEqual(new Set(['760,570']));
    await page.close();
  });

  it('shimmers a far box once scrolling brings it near', async () => {
    const page = await thread();
    await page.evaluate(() => { document.getElementById('scroll')!.scrollTop = 1e6; });
    await page.waitForTimeout(300);
    expect((await shimmers(page)).slice(-3)).toEqual(['phone-shimmer', 'phone-shimmer', 'phone-shimmer']);
    await page.close();
  });
});
