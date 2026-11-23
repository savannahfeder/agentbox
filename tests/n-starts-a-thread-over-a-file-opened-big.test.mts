// N STARTS A THREAD OVER A FILE OPENED BIG, AND THE NEW THREAD BOX OPENS ON TOP.
//
// Reported on 2026-11-22 from a picture opened big with its Notes beside it:
// with nothing selected, N went into the notes box instead of starting a
// thread, as N does on every other page. Read off ArtifactView.tsx: its
// document listener sends any loose letter to the notes box and stops every
// plain key before the app's own listener on the window, so N never reached
// it. The picture view stops every plain key at the window the same way. And
// had N got through, the new thread box (.modal-backdrop.tc-veil, z-index 40)
// would have drawn under the big views (9400, the file sheet 900), with the
// file view's capture Escape closing the file under the open box. Over the
// file sheet, which never took N, that is what N did already.
//
// Must still hold: N typed in the notes box or any other box is a letter, a
// loose letter other than N still goes to the notes box, and ⌘K keeps what
// it was given.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { startsAThread, composerIsOpen, pressedInTheComposer, aBigViewIsOpen } from '../renderer/src/over-a-big-view.ts';
import { letterGoesToTheNote } from '../renderer/src/artifact-pins.ts';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && fs.existsSync(chromium.executablePath());
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('N', () => {
  it('starts a thread when no box takes the letter', () => {
    expect(startsAThread({ key: 'n', chord: false, inABox: false })).toBe(true);
    expect(startsAThread({ key: 'N', chord: false, inABox: false })).toBe(true);
  });
  it('is a letter in a box', () => {
    expect(startsAThread({ key: 'n', chord: false, inABox: true })).toBe(false);
  });
  it('with Option, and every other key, is not N', () => {
    expect(startsAThread({ key: 'n', chord: true, inABox: false })).toBe(false);
    for (const key of ['m', 'b', 'Enter', ' ', 'ArrowRight', 'Escape']) expect(startsAThread({ key, chord: false, inABox: false }), key).toBe(false);
  });
  it('the notes box still takes any other loose letter', () => {
    expect(letterGoesToTheNote({ key: 'a', chord: false, on: 'nothing', boxThere: true })).toBe(true);
  });
});

describe('the new thread box over a big view', () => {
  const doc = (has) => ({ querySelector: (sel) => (sel.split(',').map((s) => s.trim()).some((s) => has.includes(s)) ? {} : null) });
  it('is open when its veil is on the page', () => {
    expect(composerIsOpen(doc(['.tc-veil']))).toBe(true);
    expect(composerIsOpen(doc([]))).toBe(false);
  });
  it('a key pressed inside it is its own', () => {
    const inBox = { closest: (s) => (s === '.tc-veil' ? {} : null) };
    expect(pressedInTheComposer(inBox)).toBe(true);
    expect(pressedInTheComposer({ closest: () => null })).toBe(false);
    expect(pressedInTheComposer(null)).toBe(false);
  });
  it('a big view is any of the three', () => {
    for (const v of ['.artifact-view', '.picture-view', '.file-sheet']) expect(aBigViewIsOpen(doc([v])), v).toBe(true);
    expect(aBigViewIsOpen(doc([]))).toBe(false);
  });
  it('draws over them, as the ⌘K bar does', () => {
    const css = read('renderer/src/threads/thread-composer.css');
    expect(css).toMatch(/body:has\(\.artifact-view, \.picture-view, \.file-sheet\) \.modal-backdrop\.tc-veil \{ z-index: 9480; \}/);
  });
  it('the file sheet leaves Escape to it', () => {
    const sheet = read('renderer/src/components/FileSheet.tsx');
    const onKey = sheet.slice(sheet.indexOf('const onKey = (e: KeyboardEvent)'), sheet.indexOf("window.addEventListener('keydown', onKey, true)"));
    expect(onKey).toContain('!composerIsOpen(document)');
  });
  it('N on a page whose own box sits behind a big view opens the box over it', () => {
    const app = read('renderer/src/App.tsx');
    const start = app.slice(app.indexOf('const startThread = () => {'), app.indexOf('const startThread = () => {') + 400);
    expect(start).toContain('!aBigViewIsOpen(document)');
  });
});

const D = '/Users/someone/store/designs/w-1';
// A document, which opens without a picture to load, so its notes box is drawn.
const ledger = [{ id: 'l1', ts: Date.UTC(2026, 10, 21, 19, 0, 0), source: 'agent', patch: { result: `The plan:\n\n${D}/plan.md` } }];

let browser;
const page = async (which) => {
  const view = which === 'file'
    ? `<ArtifactView product="p" thread="t" lines={${JSON.stringify(ledger)}} numbers={{}} marks={{ notes: [], approvals: [], seen: {} }} me="u-me" people={[]}
        open={{ path: ${JSON.stringify(`${D}/plan.md`)} }} ownerOfRow="u-me" withAgent write={async () => ({ ok: true })} onClose={() => { window.shut += 1; }}
        files={{ find: async (f) => f, readText: async () => 'Ship the hero.' }} />`
    : `<PictureView pictures={[{ path: 'a.png', url: null }]} start={0} resolve={async () => null} onClose={() => { window.shut += 1; }} />`;
  const bundle = (await build({
    stdin: { contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { ArtifactView } from './renderer/src/components/ArtifactView';
      import { PictureView } from './renderer/src/components/PictureView';
      const call = () => Promise.resolve(Object.assign([], { ok: true }));
      window.zero = new Proxy({}, { get: (_, k) => (k === 'liveRoom' ? () => Promise.resolve(null) : typeof k === 'string' && k.startsWith('on') ? () => () => {} : call) });
      window.shut = 0;
      window.heard = [];
      // Where the app listens: the window, after the page.
      window.addEventListener('keydown', (e) => window.heard.push(e.key));
      createRoot(document.getElementById('root')).render(${view});`,
    resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', logLevel: 'error',
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'empty', '.mp3': 'empty' },
  })).outputFiles[0].text;
  const p = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  p.setDefaultTimeout(5_000);
  await p.route('http://view.test/**', (r) => r.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
  await p.goto('http://view.test/');
  await p.addScriptTag({ content: bundle });
  await p.locator(which === 'file' ? '.av-stage' : '.picture-view').waitFor();
  return p;
};
const heard = (p) => p.evaluate(() => window.heard);
const nothingHeld = (p) => p.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur?.(); });
const openTheComposer = (p) => p.evaluate(() => {
  const veil = document.createElement('div');
  veil.className = 'modal-backdrop tc-veil';
  veil.innerHTML = '<textarea aria-label="New thread"></textarea>';
  document.body.append(veil);
  veil.querySelector('textarea')!.focus();
});

describe.skipIf(!browserAvailable)('in the big file view', () => {
  beforeAll(async () => { browser = await chromium.launch({ headless: true }); }, 60_000);
  afterAll(async () => { await browser?.close(); });

  it('N with nothing selected reaches the app and leaves the notes box empty', async () => {
    const p = await page('file');
    await nothingHeld(p);
    await p.keyboard.press('n');
    expect(await heard(p)).toContain('n');
    expect(await p.locator('.av-write-box textarea').inputValue()).toBe('');
    await p.close();
  }, 30_000);

  it('any other loose letter still goes to the notes box, and N typed there is a letter', async () => {
    const p = await page('file');
    await nothingHeld(p);
    await p.keyboard.press('a');
    await p.keyboard.press('n');
    expect(await p.locator('.av-write-box textarea').inputValue()).toBe('an');
    expect(await heard(p)).toEqual([]);
    await p.close();
  }, 30_000);

  it('Escape in the new thread box over it leaves the file open, and its keys are not the file\'s', async () => {
    const p = await page('file');
    await openTheComposer(p);
    await p.keyboard.press('ArrowRight');
    await p.keyboard.press('Escape');
    expect(await p.evaluate(() => window.shut)).toBe(0);
    expect(await heard(p)).toEqual(['ArrowRight', 'Escape']);
    await p.close();
  }, 30_000);

  it('Escape with no box open still closes the file', async () => {
    const p = await page('file');
    await nothingHeld(p);
    await p.keyboard.press('Escape');
    expect(await p.evaluate(() => window.shut)).toBe(1);
    await p.close();
  }, 30_000);
});

describe.skipIf(!browserAvailable)('in the picture view', () => {
  beforeAll(async () => { browser = await chromium.launch({ headless: true }); }, 60_000);
  afterAll(async () => { await browser?.close(); });

  it('N reaches the app', async () => {
    const p = await page('picture');
    await p.keyboard.press('n');
    expect(await heard(p)).toContain('n');
    await p.close();
  }, 30_000);

  it('keys typed in the new thread box over it reach the box, and Escape there leaves the picture open', async () => {
    const p = await page('picture');
    await openTheComposer(p);
    await p.keyboard.type('hi');
    await p.keyboard.press('Escape');
    expect(await p.locator('.tc-veil textarea').inputValue()).toBe('hi');
    expect(await heard(p)).toEqual(['h', 'i', 'Escape']);
    expect(await p.evaluate(() => window.shut)).toBe(0);
    await p.close();
  }, 30_000);

  it('its other keys stay its own', async () => {
    const p = await page('picture');
    await p.keyboard.press('j');
    await p.keyboard.press('Escape');
    expect(await heard(p)).toEqual([]);
    expect(await p.evaluate(() => window.shut)).toBe(1);
    await p.close();
  }, 30_000);
});
