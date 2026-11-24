// THE PRACTICE SEND TIP KEEPS ITS WORDS UNTIL IT GOES.
//
// Filmed frame by frame on the cloud after the Nov 23 onboarding call's
// "flickers coming through": pressing ⌃↵ on the walkthrough's practice thread
// changed its tip from "Press ⌃↵ to send this practice thread" to "Press ⌃↵ to
// send it to an agent" for 151 ms before the tip went. The practice thread
// gets its id the moment it is made, which ends App.tsx's `tourTask`, while
// the walkthrough has not yet noted it as sent.
//
// Measured by rendering the real Tour in Chromium over a New thread box and
// reading the tip's words on every frame after that handover.
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
      import { saveTour, startTour } from './renderer/src/tour';
      const first = startTour();
      function App() {
        const [tour, setTourState] = useState(() => { saveTour(localStorage, first); return first; });
        const [made, setMade] = useState(null);
        const [practice, setPractice] = useState(new URLSearchParams(location.search).has('practice'));
        window.made = (id) => flushSync(() => { setMade(id); setPractice(false); });
        const setTour = useCallback((t) => { saveTour(localStorage, t); setTourState(t); }, []);
        return <>
          <div className="tc-card" data-tour-folder="1" data-tour-text="1"><textarea defaultValue="Add a summary" /><button className="tc-send">Send</button></div>
          <Tour tour={tour} practice={practice} practiceId={made} view="inbox" thread={false} covered={false} palette={false} onChange={setTour} onPoint={() => {}} />
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

async function sendTip(practice: boolean) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  page.setDefaultTimeout(5_000);
  await page.route('http://tour.test/**', (r) => r.fulfill({ contentType: 'text/html', body: '<html><div id="root"></div></html>' }));
  await page.goto(`http://tour.test/${practice ? '?practice' : ''}`);
  await page.addScriptTag({ content: bundle });
  await page.locator('.tour-card', { hasText: 'to send' }).waitFor();
  await page.waitForTimeout(300);
  return page;
}

/** The tip's words on each of the next frames after `change` runs in the page. */
const wordsAfter = (page, change: string, frames = 12): Promise<string[]> => page.evaluate(([change, frames]) => new Promise((resolve) => {
  const seen: string[] = [];
  const look = () => {
    seen.push(document.querySelector('.tour-say')?.textContent ?? '');
    if (seen.length < frames) requestAnimationFrame(look); else resolve(seen);
  };
  (0, eval)(change);
  requestAnimationFrame(look);
}), [change, frames] as const);

describe.skipIf(!browserAvailable)('the send tip', () => {
  it('on the practice thread says "practice thread" on every frame after the thread is made', async () => {
    const page = await sendTip(true);
    expect(await page.locator('.tour-say').textContent()).toMatch(/send this practice thread/);
    const words = await wordsAfter(page, 'window.made("w-practice")');
    expect(words.filter((w) => !/send this practice thread/.test(w))).toEqual([]);
    await page.close();
  });

  it('on a thread of your own still says "send it to an agent"', async () => {
    const page = await sendTip(false);
    expect(await page.locator('.tour-say').textContent()).toMatch(/send it to an agent/);
    await page.close();
  });
});
