// A PICTURE IS SHRUNK OFF THE WINDOW'S THREAD, SO A THREAD SCROLLS WHILE ITS PICTURES LOAD.
//
// "Scrolling is so slow that it's constantly slowing down" on a thread of 86
// screenshots (w-47c0223d60, 2026-11-22). Measured in the built app's browser
// copy at the owner's window size, a thread of 32 Retina screenshots, the
// processor slowed 4x: scrolling while the pictures loaded dropped 258 frames
// past 50 ms, the worst 400 ms, and 6.3 s of the window's time went to making
// the shrunk copies. Timed step by step on one 2880x1800 screenshot: resizing
// a decoded picture held the window's thread for 68 ms, resizing straight from
// the file for 69 ms; the same steps in a worker held it for 9 ms.
//
// So the decode, the resize and the encode run in a worker. A window where no
// worker can start, or that cannot shrink there, does it the old way.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import vm from 'node:vm';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fitPicture, offTheWindow, workerSource } from '../renderer/src/fit-picture.ts';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium.executablePath());

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const box = { width: 760 };

describe('fitPicture', () => {
  it('hands the whole shrink to `shrink` when there is one, and decodes nothing itself', async () => {
    const asked = [];
    let decoded = 0;
    const r = await fitPicture('pic', box, {
      fetch: async () => ({ ok: true, blob: async () => new Blob([PNG]) }),
      decode: async () => { decoded += 1; throw new Error('decoded on the window'); },
      encode: async () => { throw new Error('encoded on the window'); },
      shrink: async (blob, b, pixels) => { asked.push([b, pixels]); return { blob: new Blob(['small']), shrunk: true }; },
      link: () => 'blob:1',
      scale: () => 2,
    });
    expect(r).toEqual({ url: 'blob:1', shrunk: true });
    expect(asked).toEqual([[box, 2]]);
    expect(decoded).toBe(0);
  });
});

// The worker runs the module's own functions from their source, so the source
// has to stand on its own: nothing it names may live outside it.
describe('the worker program', () => {
  const run = (size) => {
    const replies = [];
    const made = [];
    const bitmap = (w, h) => ({ width: w, height: h, close() {} });
    const sandbox = {
      createImageBitmap: async (from, resize) => (resize ? bitmap(resize.resizeWidth, resize.resizeHeight) : bitmap(size.w, size.h)),
      OffscreenCanvas: class { constructor(w, h) { this.w = w; this.h = h; made.push([w, h]); } getContext() { return { drawImage() {} }; } convertToBlob() { return Promise.resolve(`png ${this.w}x${this.h}`); } },
      postMessage: (m) => replies.push(m),
      Math, Number, Infinity, String, Error,
    };
    vm.runInNewContext(workerSource(), sandbox);
    return { sandbox, replies, made };
  };

  it('shrinks a Retina screenshot to the pixels 760 points need on a 2x screen', async () => {
    const { sandbox, replies, made } = run({ w: 2880, h: 1800 });
    await sandbox.onmessage({ data: { id: 7, blob: 'file', box, pixels: 2 } });
    expect(replies).toEqual([{ id: 7, copy: { blob: 'png 1520x950', shrunk: true } }]);
    expect(made).toEqual([[1520, 950]]);
  });

  it('answers with the file itself when it is near its size already', async () => {
    const { sandbox, replies } = run({ w: 1500, h: 900 });
    await sandbox.onmessage({ data: { id: 1, blob: 'file', box, pixels: 2 } });
    expect(replies).toEqual([{ id: 1, copy: { blob: 'file', shrunk: false } }]);
  });

  it('says so when it cannot shrink here, rather than failing every picture', async () => {
    const { sandbox, replies } = run({ w: 2880, h: 1800 });
    delete sandbox.OffscreenCanvas;
    await sandbox.onmessage({ data: { id: 2, blob: 'file', box, pixels: 2 } });
    expect(replies).toEqual([{ id: 2, unable: true }]);
  });
});

describe('offTheWindow', () => {
  const here = async () => ({ blob: new Blob(['here']), shrunk: true });
  const fakeWorker = (answer) => {
    const w = { posted: 0, onmessage: null, onerror: null, terminate() {} };
    w.postMessage = (m) => { w.posted += 1; answer?.(w, m); };
    return w;
  };
  const text = async (copy) => copy.blob.text();

  it('takes the worker\'s copy', async () => {
    const w = fakeWorker((worker, m) => setTimeout(() => worker.onmessage({ data: { id: m.id, copy: { blob: new Blob(['worker']), shrunk: true } } })));
    const shrink = offTheWindow(() => w, here);
    expect(await text(await shrink(new Blob([PNG]), box, 2))).toBe('worker');
  });

  it('shrinks here when no worker can start', async () => {
    const shrink = offTheWindow(() => { throw new Error('no workers'); }, here);
    expect(await text(await shrink(new Blob([PNG]), box, 2))).toBe('here');
  });

  it('shrinks here, and stops asking, when the worker cannot shrink', async () => {
    const w = fakeWorker((worker, m) => setTimeout(() => worker.onmessage({ data: { id: m.id, unable: true } })));
    const shrink = offTheWindow(() => w, here);
    expect(await text(await shrink(new Blob([PNG]), box, 2))).toBe('here');
    expect(await text(await shrink(new Blob([PNG]), box, 2))).toBe('here');
    expect(w.posted).toBe(1);
  });

  it('tries the window for a picture the worker failed on, and keeps the worker for the next', async () => {
    let n = 0;
    const w = fakeWorker((worker, m) => setTimeout(() => worker.onmessage({ data: n++ === 0 ? { id: m.id, error: 'bad file' } : { id: m.id, copy: { blob: new Blob(['worker']), shrunk: true } } })));
    const shrink = offTheWindow(() => w, here);
    expect(await text(await shrink(new Blob([PNG]), box, 2))).toBe('here');
    expect(await text(await shrink(new Blob([PNG]), box, 2))).toBe('worker');
  });

  it('does not wait for ever on a worker that never answers', async () => {
    const shrink = offTheWindow(() => fakeWorker(), here, 20);
    expect(await text(await shrink(new Blob([PNG]), box, 2))).toBe('here');
  });

  it('gives up on a worker that died, for this picture and the rest', async () => {
    const w = fakeWorker((worker) => setTimeout(() => worker.onerror()));
    const shrink = offTheWindow(() => w, here);
    expect(await text(await shrink(new Blob([PNG]), box, 2))).toBe('here');
    expect(await text(await shrink(new Blob([PNG]), box, 2))).toBe('here');
    expect(w.posted).toBe(1);
  });
});

// The built app minifies this file, and a worker made from a minified function
// is what the window really runs, so this is checked in a real browser too.
let browser, bundle, picture;
beforeAll(async () => {
  if (!browserAvailable) return;
  bundle = (await build({
    stdin: { contents: `
      import { fitPicture } from './renderer/src/fit-picture.ts';
      window.fit = async (url) => {
        const r = await fitPicture(url, { width: 760 });
        const img = new Image();
        img.src = r.url;
        await img.decode();
        return { shrunk: r.shrunk, width: img.naturalWidth, height: img.naturalHeight };
      };`,
    resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, write: false, format: 'iife', minify: true, logLevel: 'error',
  })).outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
  // A 2880x1800 screenshot with detail in it, drawn by the browser itself.
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await page.setContent('<body style="margin:0;background:linear-gradient(135deg,#fde,#cdf)"><h1 style="font:64px system-ui;text-align:center;margin-top:300px">A screenshot</h1></body>');
  picture = await page.screenshot();
  await page.close();
}, 60_000);
afterAll(async () => { await browser?.close(); });

describe.skipIf(!browserAvailable)('in a real window', () => {
  it('shrinks a Retina screenshot without decoding or drawing it on the window\'s thread', async () => {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 2 });
    await page.route('http://pictures.test/**', (r) => (r.request().url().endsWith('.png')
      ? r.fulfill({ contentType: 'image/png', body: picture })
      : r.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' })));
    await page.goto('http://pictures.test/');
    await page.evaluate(() => {
      const counts = { decodes: 0, canvases: 0 };
      (window as unknown as { counts: typeof counts }).counts = counts;
      const decode = window.createImageBitmap.bind(window);
      window.createImageBitmap = ((...a: Parameters<typeof createImageBitmap>) => { counts.decodes += 1; return decode(...a); }) as typeof createImageBitmap;
      const Canvas = window.OffscreenCanvas;
      window.OffscreenCanvas = class extends Canvas { constructor(w: number, h: number) { super(w, h); counts.canvases += 1; } };
    });
    await page.addScriptTag({ content: bundle });
    const got = await page.evaluate(() => (window as unknown as { fit: (u: string) => Promise<unknown> }).fit('http://pictures.test/shot.png'));
    expect(got).toEqual({ shrunk: true, width: 1520, height: 950 });
    expect(await page.evaluate(() => (window as unknown as { counts: unknown }).counts)).toEqual({ decodes: 0, canvases: 0 });
    await page.close();
  }, 30_000);
});
