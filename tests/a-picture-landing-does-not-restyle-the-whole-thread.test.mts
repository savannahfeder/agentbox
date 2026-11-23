// A PICTURE LANDING DOES NOT RESTYLE THE WHOLE THREAD.
//
// "Scrolling is so slow that it's constantly slowing down" on a thread of 86
// screenshots (w-47c0223d60, 2026-11-22). Traced in the built app's browser
// copy while its pictures loaded: the longest frames were each one restyle of
// all 579 elements in the thread, about 70 ms with the processor slowed 4x.
// The button around a picture held the column's width while the picture was
// on its way through a `:has()` rule that read the picture's own state, so
// every picture's three changes as it landed (placeholder gone, loading,
// ready) set the browser re-checking the whole thread. Timed in that window,
// one such change: 9.8 ms of restyle with the rule, 0.4 ms with none, 0.5 ms
// with the button marked instead.
//
// So whoever knows a picture is on its way marks its button: FittedImg while
// it holds the place, watchPicture while the file loads.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { watchPicture } from '../renderer/src/phone-files.ts';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium.executablePath());
function existsSync(p) { return fs.existsSync(p); }

const root = path.join(import.meta.dirname, '..');
const stylesheets = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  const at = path.join(dir, d.name);
  if (d.isDirectory()) return d.name === 'node_modules' || d.name === 'dist' ? [] : stylesheets(at);
  return d.name.endsWith('.css') ? [at] : [];
});

describe('the stylesheets', () => {
  it('key no :has() on a picture\'s loading state', () => {
    const found = [];
    for (const file of stylesheets(path.join(root, 'renderer', 'src'))) {
      const css = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of css.matchAll(/:has\(([^{]*?)\)\s*[,{]/g)) {
        if (/arriving|data-phone-img/.test(m[1])) found.push(`${path.relative(root, file)}: :has(${m[1]})`);
      }
    }
    expect(found).toEqual([]);
  });
});

/** An <img> as watchPicture sees it, in an open button or not. */
function picture({ inDoor = true, cls = 'inline-image' } = {}) {
  const door = { attrs: new Set(), classList: { contains: (c) => c === 'inline-image-open' }, toggleAttribute(k, on) { if (on) this.attrs.add(k); else this.attrs.delete(k); } };
  const attrs = new Map([['src', '/f/key/img/shot.png']]);
  const on = new Map();
  return {
    door,
    complete: false, naturalWidth: 0, naturalHeight: 0, style: {},
    parentElement: inDoor ? door : null,
    classList: { contains: (c) => cls.split(' ').includes(c) },
    getAttribute: (k) => attrs.get(k) ?? null,
    setAttribute: (k, v) => attrs.set(k, v),
    addEventListener: (k, fn) => on.set(k, fn),
    fire(k, w = 0, h = 0) { this.complete = true; this.naturalWidth = w; this.naturalHeight = h; on.get(k)?.(); },
  };
}

describe('watchPicture', () => {
  it('marks the open button while its picture loads, and clears it when it lands', () => {
    const img = picture();
    watchPicture(img);
    expect([...img.door.attrs]).toEqual(['data-picture-loading']);
    img.fire('load', 800, 600);
    expect([...img.door.attrs]).toEqual([]);
  });

  it('clears it when the picture fails too', () => {
    const img = picture();
    watchPicture(img);
    img.fire('error');
    expect([...img.door.attrs]).toEqual([]);
  });

  it('leaves alone a button around something that is not a message picture', () => {
    const img = picture({ cls: 'avatar' });
    watchPicture(img);
    expect([...img.door.attrs]).toEqual([]);
  });

  it('is fine with a picture that has no button around it', () => {
    expect(() => watchPicture(picture({ inDoor: false }))).not.toThrow();
  });
});

// Rendered with the app's own styles, in a column 760 wide.
let browser, bundle, small;
beforeAll(async () => {
  if (!browserAvailable) return;
  bundle = (await build({
    stdin: { contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { FittedImg } from './renderer/src/components/FittedImg';
      import { installPictureWatch } from './renderer/src/phone-files';
      installPictureWatch();
      createRoot(document.getElementById('root')).render(
        <p><button type="button" className="inline-image-open"><FittedImg className="inline-image" src="http://thread.test/small.png" alt="" /><span className="inline-image-name">small.png</span></button></p>);`,
    resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', logLevel: 'error',
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'empty' },
  })).outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  small = await page.screenshot();
  await page.close();
}, 60_000);
afterAll(async () => { await browser?.close(); });

describe.skipIf(!browserAvailable)('a picture in its open button', () => {
  it('holds the column\'s width while on its way, then the picture\'s own once drawn', async () => {
    const css = fs.readFileSync(path.join(root, 'renderer/src/styles.css'), 'utf8');
    const page = await browser.newPage({ viewport: { width: 900, height: 800 } });
    let release;
    const held = new Promise((r) => { release = r; });
    await page.route('http://thread.test/**', async (r) => {
      if (!r.request().url().endsWith('.png')) return r.fulfill({ contentType: 'text/html', body: `<html data-theme="dark"><style>${css}</style><div id="root" style="width:760px"></div></html>` });
      await held;
      return r.fulfill({ contentType: 'image/png', body: small });
    });
    await page.goto('http://thread.test/');
    await page.addScriptTag({ content: bundle });
    await page.waitForSelector('.inline-image.arriving');
    const door = () => page.evaluate(() => {
      const b = document.querySelector('.inline-image-open')!;
      const img = b.querySelector('.inline-image')!;
      return { width: Math.round(b.getBoundingClientRect().width), picture: Math.round(img.getBoundingClientRect().width), marks: b.getAttributeNames().filter((n) => n.startsWith('data-picture')) };
    });
    expect(await door()).toMatchObject({ width: 760, marks: ['data-picture-arriving'] });
    release();
    await page.waitForFunction(() => document.querySelector('.inline-image[data-phone-img="ready"]'));
    const drawn = await door();
    expect(drawn.marks).toEqual([]);
    expect(drawn.picture).toBeLessThan(420);
    expect(drawn.width).toBe(drawn.picture);
    await page.close();
  }, 30_000);
});
