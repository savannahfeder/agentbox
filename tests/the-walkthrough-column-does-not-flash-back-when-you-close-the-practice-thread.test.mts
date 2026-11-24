// THE WALKTHROUGH COLUMN DOES NOT FLASH "BACK TO THE WALKTHROUGH" WHEN YOU CLOSE THE PRACTICE THREAD.
//
// Filmed frame by frame on the cloud after the Nov 23 onboarding call's
// "flickers coming through": E on the practice thread showed "Back to the
// walkthrough" in the column beside the app for about 70 ms. App.tsx draws the
// list with the thread gone one render before the walkthrough notes the close,
// and for that render you count as having left the practice thread.
//
// Measured by rendering the real TourFrame in Chromium and reading the column
// on every frame.
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
      import React, { useState } from 'react';
      import { flushSync } from 'react-dom';
      import { createRoot } from 'react-dom/client';
      import { TourFrame } from './renderer/src/components/TourFrame';
      function App() {
        const [away, setAway] = useState(false);
        window.away = (on) => flushSync(() => setAway(on));
        return <TourFrame done={['compose', 'open', 'choose']} now="close" away={away} onBack={() => {}} onSkip={() => {}} />;
      }
      createRoot(document.getElementById('root')).render(<App />);`,
    resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', logLevel: 'error',
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'empty', '.mp3': 'empty' },
  })).outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
}, 60_000);
afterAll(async () => { await browser?.close(); });

async function column() {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  page.setDefaultTimeout(5_000);
  await page.route('http://tour.test/**', (r) => r.fulfill({ contentType: 'text/html', body: '<html><div id="root"></div></html>' }));
  await page.goto('http://tour.test/');
  await page.addScriptTag({ content: bundle });
  await page.locator('.tour-frame').waitFor();
  return page;
}

/** Whether Back shows, on each of the next frames after `change` runs in the page. */
const backAfter = (page, change: string, frames = 20): Promise<boolean[]> => page.evaluate(([change, frames]) => new Promise((resolve) => {
  const seen: boolean[] = [];
  const look = () => {
    seen.push(!!document.querySelector('.tf-back'));
    if (seen.length < frames) requestAnimationFrame(look); else resolve(seen);
  };
  (0, eval)(change);
  requestAnimationFrame(look);
}), [change, frames] as const);

describe.skipIf(!browserAvailable)('Back to the walkthrough', () => {
  it('never shows for a moment of being away that ends at once', async () => {
    const page = await column();
    const frames = await backAfter(page, 'window.away(true); requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => window.away(false))))');
    expect(frames.filter(Boolean)).toEqual([]);
    await page.close();
  });

  it('shows once you have stayed away', async () => {
    const page = await column();
    await page.evaluate(() => (window as unknown as { away: (on: boolean) => void }).away(true));
    await page.locator('.tf-back', { hasText: 'Back to the walkthrough' }).waitFor({ timeout: 1_500 });
    await page.close();
  });

  it('goes in the same frame you come back', async () => {
    const page = await column();
    await page.evaluate(() => (window as unknown as { away: (on: boolean) => void }).away(true));
    await page.locator('.tf-back').waitFor({ timeout: 1_500 });
    const frames = await backAfter(page, 'window.away(false)', 5);
    expect(frames.filter(Boolean)).toEqual([]);
    await page.close();
  });

  it('never shows while you are on the walkthrough', async () => {
    const page = await column();
    const frames = await backAfter(page, 'void 0', 40);
    expect(frames.filter(Boolean)).toEqual([]);
    await page.close();
  });
});
