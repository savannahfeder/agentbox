// A THREAD DRAWS THE PICTURES ON SCREEN FIRST, AND FORGETS THE ONES SCROLLED PAST.
//
// What broke (2026-11-22): "Threads with a bunch of images just get so slow
// and they don't load." A picture asked to be shrunk once it came within a
// screen of view and then kept its place in line for good. Measured with the
// real FittedImg in Chromium, 40 Retina screenshots, a fast scroll of ten
// screens then a stop (scripts/scratch, median of five): the pictures on
// screen showed after 1.3 s, behind pictures scrolled past, and 32 of the 40
// had been shrunk by the end of a second scroll. With the fix: 0.5 to 0.7 s,
// and 10 to 19 shrunk.
//
// The line itself is held by a-picture-on-screen-never-waits-behind-pictures-around-it;
// this is the real component in a real browser, watched through the decoder.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium.executablePath());

const COUNT = 24;
const SCREEN = 800;
let browser, bundle;
const pictures: Buffer[] = [];

// Every picture, waiting or drawn, holds the pictures' own shape, so nothing
// moves as they land and "within a screen" means the same at the end as it did
// when each was asked for.
const CSS = `
  body { margin: 0; font: 14px sans-serif; }
  .inline-image { display: block; width: 100%; aspect-ratio: 16 / 10; margin: 8px 0; }
  .inline-image.arriving { background: #ddd; }`;

beforeAll(async () => {
  if (!browserAvailable) return;
  bundle = (await build({
    stdin: { contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { flushSync } from 'react-dom';
      import { FittedImg } from './renderer/src/components/FittedImg';
      window.mount = (n) => {
        const root = createRoot(document.getElementById('root'));
        flushSync(() => root.render(
          <div id="scroller" style={{ height: ${SCREEN}, width: 900, overflowY: 'auto' }}>
            <div style={{ width: 760, margin: '0 auto' }}>
              {Array.from({ length: n }, (_, i) => (
                <div key={i} data-i={i}>
                  <p>Message {i}</p>
                  <FittedImg className="inline-image" minWidth={760} src={'https://pic.test/p' + i + '.png'} alt="" crossOrigin="anonymous" />
                </div>
              ))}
            </div>
          </div>));
        const s = document.getElementById('scroller');
        s.scrollTop = s.scrollHeight;
      };`,
      resolveDir: process.cwd(), loader: 'tsx',
    },
    bundle: true, write: false, format: 'iife', jsx: 'automatic',
    loader: { '.css': 'empty', '.svg': 'empty', '.png': 'empty' },
    define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' },
  })).outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
  // Screenshots 2000 pixels wide, each its own bytes, so none is a copy of another.
  const page = await browser.newPage({ viewport: { width: 1000, height: 625 }, deviceScaleFactor: 2 });
  for (let i = 0; i < COUNT; i++) {
    await page.setContent(`<body style="margin:0;padding:20px;background:hsl(${i * 15} 40% 30%);color:#fff;font:16px sans-serif">${`Screenshot ${i} of a thread. `.repeat(60)}</body>`);
    pictures.push(await page.screenshot());
  }
  await page.close();
}, 120_000);
afterAll(async () => { await browser?.close(); });

async function open({ scriptedSight = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 900, height: SCREEN }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  // Whether a picture is in reach is said by the test, not the scroll, and a
  // hook on the copy's link lets it say so the moment the copy lands.
  if (scriptedSight) await page.addInitScript(() => {
    const w = window as never as { sight: (i: number, near: boolean) => void; onLink?: () => void };
    const made: { cb: IntersectionObserverCallback; near: boolean; targets: Element[] }[] = [];
    window.IntersectionObserver = class {
      cb: IntersectionObserverCallback; near: boolean; targets: Element[] = [];
      constructor(cb: IntersectionObserverCallback, opts?: IntersectionObserverInit) { this.cb = cb; this.near = !!opts?.rootMargin; made.push(this); }
      observe(el: Element) { this.targets.push(el); }
      unobserve() {}
      disconnect() {}
      takeRecords() { return []; }
    } as never;
    w.sight = (i, near) => {
      for (const o of made) for (const target of o.targets) {
        if (target.closest('[data-i]')?.getAttribute('data-i') !== String(i)) continue;
        o.cb([{ isIntersecting: o.near ? near : false, target } as never], o as never);
      }
    };
    const link = URL.createObjectURL;
    URL.createObjectURL = (blob) => { const url = link(blob); const then = w.onLink; w.onLink = undefined; then?.(); return url; };
  });
  await page.route('https://pic.test/**', (route) => {
    const m = /\/p(\d+)\.png$/.exec(new URL(route.request().url()).pathname);
    if (m) return route.fulfill({ contentType: 'image/png', body: pictures[Number(m[1])], headers: { 'access-control-allow-origin': '*' } });
    return route.fulfill({ contentType: 'text/html', body: `<style>${CSS}</style><div id="root"></div>` });
  });
  // Every whole picture the decoder is handed, which one and when.
  await page.addInitScript(() => {
    const w = window as never as { decodes: { i: number; at: number }[] };
    w.decodes = [];
    const names = new WeakMap<Blob, string>();
    const fetched = window.fetch;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const res = await fetched(...args);
      const blob = res.blob.bind(res);
      res.blob = async () => { const b = await blob(); names.set(b, String(args[0])); return b; };
      return res;
    };
    const decode = window.createImageBitmap;
    window.createImageBitmap = function (from: ImageBitmapSource, ...rest: never[]) {
      const name = from instanceof Blob ? names.get(from) : undefined;
      if (name) w.decodes.push({ i: Number(/p(\d+)\.png/.exec(name)![1]), at: performance.now() });
      return (decode as (...a: unknown[]) => Promise<ImageBitmap>).call(this, from, ...rest);
    } as typeof createImageBitmap;
  });
  await page.goto('https://pic.test/');
  await page.addScriptTag({ content: bundle });
  await page.evaluate((n) => (window as never as { mount: (n: number) => void }).mount(n), COUNT);
  return { page, context };
}

// The pictures within `margin` screens of view, by number.
const within = (page, margin: number) => page.evaluate((m) => {
  const s = document.getElementById('scroller')!.getBoundingClientRect();
  return [...document.querySelectorAll('[data-i]')].filter((el) => {
    const r = el.querySelector('img')!.getBoundingClientRect();
    return r.bottom > s.top - m * s.height && r.top < s.bottom + m * s.height;
  }).map((el) => Number(el.getAttribute('data-i')));
}, margin);

const drawnOnScreen = (page) => page.waitForFunction(() => {
  const s = document.getElementById('scroller')!.getBoundingClientRect();
  const on = [...document.querySelectorAll('[data-i] img')].filter((img) => {
    const r = img.getBoundingClientRect();
    return r.bottom > s.top && r.top < s.bottom;
  });
  return on.length > 0 && on.every((img) => (img as HTMLImageElement).src.startsWith('blob:'));
}, null, { timeout: 30_000 });

const decodes = (page): Promise<{ i: number; at: number }[]> => page.evaluate(() => (window as never as { decodes: { i: number; at: number }[] }).decodes);

// The pictures drawn from a copy that will not load.
const broken = (page): Promise<number[]> => page.evaluate(() => [...document.querySelectorAll('[data-i]')]
  .filter((el) => { const img = el.querySelector('img') as HTMLImageElement; return img.src.startsWith('blob:') && img.complete && img.naturalWidth === 0; })
  .map((el) => Number(el.getAttribute('data-i'))));

describe.skipIf(!browserAvailable)('a thread of screenshots', () => {
  it('opened at its end, shrinks the pictures on screen before the ones a screen above', async () => {
    const { page, context } = await open();
    await drawnOnScreen(page);
    const on = await within(page, 0);
    await page.waitForFunction((n) => (window as never as { decodes: unknown[] }).decodes.length > n, on.length, { timeout: 30_000 });
    const first = (await decodes(page)).slice(0, on.length).map((d) => d.i);
    expect(first.sort((a, b) => a - b)).toEqual(on);
    await context.close();
  }, 60_000);

  it('after a fast scroll, forgets the pictures it left behind and shrinks the ones on screen first', async () => {
    const { page, context } = await open();
    await drawnOnScreen(page);
    // Ten screens up in 400 ms, stopping in the middle of the thread.
    const stoppedAt = await page.evaluate((by) => new Promise<number>((done) => {
      const s = document.getElementById('scroller')!;
      let steps = 0;
      const step = () => {
        s.scrollTop -= by;
        if (++steps < 10) setTimeout(step, 40);
        else done(performance.now());
      };
      step();
    }), SCREEN);
    await drawnOnScreen(page);
    await page.waitForTimeout(300);
    const on = await within(page, 0);
    const near = await within(page, 1);
    const after = (await decodes(page)).filter((d) => d.at > stoppedAt).map((d) => d.i);
    // Nothing scrolled out of reach is shrunk once the scroll has stopped.
    expect(after.filter((i) => !near.includes(i))).toEqual([]);
    // And nothing around the screen goes before what is on it.
    const firstAround = after.findIndex((i) => !on.includes(i));
    const lastOn = Math.max(-1, ...on.map((i) => after.indexOf(i)));
    if (firstAround !== -1) expect(lastOn).toBeLessThan(firstAround);
    expect(await broken(page)).toEqual([]);
    await context.close();
  }, 60_000);

  // A copy let go the moment it was drawn left a broken picture, and one
  // already drawn is never asked for again, so it stayed broken.
  it('draws a picture whose copy lands just as it leaves reach', async () => {
    const { page, context } = await open({ scriptedSight: true });
    await page.evaluate(() => {
      const w = window as never as { sight: (i: number, near: boolean) => void; onLink?: () => void };
      w.onLink = () => w.sight(5, false);
      w.sight(5, true);
    });
    await page.waitForFunction(() => ((document.querySelector('[data-i="5"] img') as HTMLImageElement).src.startsWith('blob:')), null, { timeout: 30_000 });
    await page.waitForTimeout(300);
    expect(await broken(page)).toEqual([]);
    const drawn = await page.evaluate(() => (document.querySelector('[data-i="5"] img') as HTMLImageElement).naturalWidth);
    expect(drawn).toBeGreaterThan(0);
    await context.close();
  }, 60_000);
});
