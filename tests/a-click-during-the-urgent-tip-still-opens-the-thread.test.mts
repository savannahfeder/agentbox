// A CLICK DURING THE URGENT TIP STILL OPENS THE THREAD.
//
// From the onboarding checklist: any key or click while "Urgent threads move
// up your list" was showing ended the tip and moved the walkthrough on, even
// when that click opened a thread. The urgent tip is usually the last one, and
// the press wrote its lesson straight away, which starts the finishing moment,
// and App.tsx takes you to Home for that from wherever you are. A click was
// worse: the lesson was written on pointerdown, Home was drawn before the
// click, and the click landed on Home. Shift or ⌘ on their own ended it too.
//
// Measured by rendering the real Tour in Chromium over a small list. The page
// copies App.tsx's one rule that matters here: a finishing walkthrough goes to
// Home and leaves the thread.
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
      import React, { useCallback, useEffect, useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { Tour } from './renderer/src/components/Tour';
      import { finishLesson, madeUrgent, noteSent, saveTour, startTour, tourFinishing } from './renderer/src/tour';
      const last = new URLSearchParams(location.search).has('last');
      const before = last ? ['start', 'working', 'open', 'choose', 'close', 'palette'] : ['start', 'working', 'palette'];
      const first = madeUrgent(before.reduce(finishLesson, noteSent(startTour())));
      const ROWS = ['a', 'b', 'c'];
      window.written = [];
      function App() {
        const [tour, setTourState] = useState(() => { saveTour(localStorage, first); return first; });
        const [thread, setThread] = useState(null);
        const [home, setHome] = useState(false);
        const setTour = useCallback((t) => {
          window.written.push({ done: t.done, finishing: !!t.finishing, onThread: !!document.querySelector('.focus-body') });
          saveTour(localStorage, t); setTourState(t);
        }, []);
        const finishing = tourFinishing(tour);
        useEffect(() => { if (finishing && !home) { setThread(null); setHome(true); } }, [finishing, home]);
        useEffect(() => {
          const key = (e) => {
            if (home) return;
            if (thread) { if (e.key === 'Escape') setThread(null); return; }
            if (e.key === 'Enter') setThread(ROWS[0]);
          };
          window.addEventListener('keydown', key);
          return () => window.removeEventListener('keydown', key);
        }, [thread, home]);
        return <>
          {home ? <div className="home">Home</div>
            : thread ? <div className="focus-body"><div className="one-title">{thread}</div><span className="dock-pill">Reply</span></div>
            : <div className="list-pane">{ROWS.map((r, i) => (
                <div key={r} className={'row' + (i === 0 ? ' selected' : '')} data-item-id={r} onClick={() => setThread(r)}>
                  <span className="subject">Thread {r}</span>{i === 0 && <span className="th-cell-prio urgent">Urgent</span>}
                </div>))}</div>}
          <Tour tour={tour} view="inbox" thread={!!thread} covered={false} palette={false} onChange={setTour} onPoint={() => {}} />
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

const CSS = `body { margin: 0; font: 15px sans-serif; } .list-pane { position: absolute; left: 40px; top: 40px; width: 700px; }
  .row { display: flex; gap: 40px; height: 60px; align-items: center; } .row .subject { width: 200px; }`;

async function urgentTip(last: boolean) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  page.setDefaultTimeout(5_000);
  await page.route('http://tour.test/**', (r) => r.fulfill({ contentType: 'text/html', body: `<html><style>${CSS}</style><div id="root"></div></html>` }));
  await page.goto(`http://tour.test/${last ? '?last' : ''}`);
  await page.addScriptTag({ content: bundle });
  await page.locator('.tour-card', { hasText: 'Urgent threads move up' }).waitFor();
  // A press in the tip's first second is not taken as having read it.
  await page.waitForTimeout(1_100);
  return page;
}
const written = (page) => page.evaluate(() => (window as unknown as { written: { done: string[]; finishing: boolean; onThread: boolean }[] }).written);
const urgentDone = async (page) => (await written(page)).some((w) => w.done.includes('urgent'));

describe.skipIf(!browserAvailable)('the urgent tip as the walkthrough’s last', () => {
  it('a click that opens a thread opens it, and the finish waits until you leave it', async () => {
    const page = await urgentTip(true);
    await page.click('.row[data-item-id="b"] .subject');
    await page.locator('.focus-body .one-title', { hasText: 'b' }).waitFor();
    await page.waitForTimeout(1_200);
    expect(await page.locator('.focus-body .one-title').textContent()).toBe('b');
    expect(await page.locator('.tour-card').count()).toBe(0);
    expect(await urgentDone(page)).toBe(false);
    await page.keyboard.press('Escape');
    await page.locator('.home').waitFor();
    expect((await written(page)).at(-1)).toEqual(expect.objectContaining({ finishing: true, onThread: false }));
    await page.close();
  });

  it('↵ that opens the thread opens it the same way', async () => {
    const page = await urgentTip(true);
    await page.keyboard.press('Enter');
    await page.locator('.focus-body .one-title', { hasText: 'a' }).waitFor();
    await page.waitForTimeout(1_200);
    expect(await page.locator('.focus-body').count()).toBe(1);
    expect(await urgentDone(page)).toBe(false);
    await page.close();
  });

  it('a plain key that does nothing else ends the tip and the walkthrough finishes', async () => {
    const page = await urgentTip(true);
    await page.keyboard.press('x');
    await page.locator('.home').waitFor();
    expect((await written(page)).at(-1)).toEqual(expect.objectContaining({ finishing: true }));
    await page.close();
  });

  it('a modifier on its own leaves the tip up', async () => {
    const page = await urgentTip(true);
    for (const key of ['Shift', 'Meta', 'Control', 'Alt']) await page.keyboard.press(key);
    await page.waitForTimeout(700);
    expect(await page.locator('.tour-card', { hasText: 'Urgent threads move up' }).count()).toBe(1);
    expect(await written(page)).toEqual([]);
    await page.close();
  });
});

describe.skipIf(!browserAvailable)('the urgent tip with more of the walkthrough to come', () => {
  it('a press that opens a thread ends it at once, and the thread’s own tip comes next', async () => {
    const page = await urgentTip(false);
    await page.keyboard.press('Enter');
    await page.locator('.focus-body').waitFor();
    await page.locator('.tour-card', { hasText: 'to answer this agent' }).waitFor();
    expect(await urgentDone(page)).toBe(true);
    await page.close();
  });
});
