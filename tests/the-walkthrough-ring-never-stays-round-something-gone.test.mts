// THE WALKTHROUGH'S RING NEVER STAYS ROUND SOMETHING THAT HAS GONE OR MOVED.
//
// A new person on the Nov 23 onboarding call saw "flickers coming through".
// Filming the first run frame by frame on the cloud found the walkthrough's
// ring and tip outliving what they pointed at on every step: pressing 1 left
// an empty gold box where the options had been, with "Press 1" still beside
// it; ↵ on the practice row left its tip floating over the thread as it
// loaded; E left the "press E" ring round the Cloud button. Each lasted up to
// 120 ms, because Tour.tsx only read the page eight times a second.
//
// Measured by rendering the real Tour in Chromium over a thread with options,
// changing the page in one go, and looking at every frame after it.
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
      import React, { useCallback, useState } from 'react';
      import { flushSync } from 'react-dom';
      import { createRoot } from 'react-dom/client';
      import { Tour } from './renderer/src/components/Tour';
      import { finishLesson, noteSent, saveTour, startTour } from './renderer/src/tour';
      const first = ['start', 'working', 'open'].reduce(finishLesson, noteSent(startTour()));
      function App() {
        const [tour, setTourState] = useState(() => { saveTour(localStorage, first); return first; });
        const [options, setOptions] = useState(true);
        const [pushed, setPushed] = useState(0);
        window.setOptions = (on) => flushSync(() => setOptions(on));
        window.push = (px) => flushSync(() => setPushed(px));
        const setTour = useCallback((t) => { saveTour(localStorage, t); setTourState(t); }, []);
        return <>
          <div className="focus-body">
            <div className="one-title">Add a summary</div>
            <div style={{ height: pushed }} />
            {options && <div className="opt-strip"><button className="opt-row">1 Make it shorter</button><button className="opt-row">2 Keep it as it is</button></div>}
          </div>
          <Tour tour={tour} view="inbox" thread covered={false} palette={false} onChange={setTour} onPoint={() => {}} />
        </>;
      }
      createRoot(document.getElementById('root')).render(<App />);`,
    resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', logLevel: 'error',
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'empty', '.mp3': 'empty' },
  })).outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
}, 60_000);
afterAll(async () => { await browser?.close(); });

const CSS = `body { margin: 0; font: 15px sans-serif; } .focus-body { position: absolute; left: 40px; top: 40px; width: 700px; }
  .opt-strip { margin-top: 300px; } .opt-row { display: block; height: 30px; width: 600px; }`;

async function chooseTip() {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  page.setDefaultTimeout(5_000);
  await page.route('http://tour.test/**', (r) => r.fulfill({ contentType: 'text/html', body: `<html><style>${CSS}</style><div id="root"></div></html>` }));
  await page.goto('http://tour.test/');
  await page.addScriptTag({ content: bundle });
  await page.locator('.tour-card', { hasText: 'to choose the recommended option' }).waitFor();
  await page.locator('.tour-glow').waitFor();
  await page.waitForTimeout(300);
  return page;
}

type Frame = { glow: { top: number; height: number } | null; card: boolean; strip: { top: number; height: number } | null };
/** Runs `change` in the page, then reads the ring, the tip and the options on each of the next frames. */
const framesAfter = (page, change: string, frames = 12): Promise<Frame[]> => page.evaluate(([change, frames]) => new Promise((resolve) => {
  const seen: Frame[] = [];
  const box = (el: Element | null) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top), height: Math.round(r.height) }; };
  const look = () => {
    // Where the ring is drawn, from its own style: the test page has no stylesheet to place it by.
    const glow = document.querySelector<HTMLElement>('.tour-glow');
    seen.push({ glow: glow && { top: Math.round(parseFloat(glow.style.top)), height: Math.round(parseFloat(glow.style.height)) }, card: !!document.querySelector('.tour-card'), strip: box(document.querySelector('.opt-strip')) });
    if (seen.length < frames) requestAnimationFrame(look); else resolve(seen);
  };
  (0, eval)(change);
  requestAnimationFrame(look);
}), [change, frames] as const);

describe.skipIf(!browserAvailable)('the walkthrough’s ring and tip', () => {
  it('go in the same frame as the options they point at', async () => {
    const page = await chooseTip();
    const frames = await framesAfter(page, 'window.setOptions(false)');
    expect(frames.every((f) => f.strip === null)).toBe(true);
    expect(frames.filter((f) => f.glow || f.card)).toEqual([]);
    await page.close();
  });

  it('move in the same frame as the options when they move', async () => {
    const page = await chooseTip();
    const frames = await framesAfter(page, 'window.push(180)');
    expect(frames[0].strip!.top).toBeGreaterThan(500);
    expect(frames.filter((f) => f.glow?.top !== f.strip?.top || f.glow?.height !== f.strip?.height)).toEqual([]);
    await page.close();
  });

  it('stay up, where they were, while nothing changes', async () => {
    const page = await chooseTip();
    const frames = await framesAfter(page, 'void 0', 20);
    expect(frames.every((f) => f.card && f.glow && f.glow.top === f.strip?.top)).toBe(true);
    await page.close();
  });

  it('come back when the options come back', async () => {
    const page = await chooseTip();
    await framesAfter(page, 'window.setOptions(false)', 3);
    await page.evaluate(() => (window as unknown as { setOptions: (on: boolean) => void }).setOptions(true));
    await page.locator('.tour-glow').waitFor();
    await page.locator('.tour-card', { hasText: 'to choose the recommended option' }).waitFor();
    await page.close();
  });
});
