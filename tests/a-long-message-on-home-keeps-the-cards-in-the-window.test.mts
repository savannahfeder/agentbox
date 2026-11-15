// Typing a long message into Home's box pushed Needs you and Team this week
// past the window's foot, at 120% zoom with two pictures attached. Measured
// on the built app at 1425x884 CSS pixels: the cards ended 39px below the
// window. Rendered here with Home's real styles and a box the size the
// composer grows to (240px of words, a row of pictures, its bar).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium.executablePath());

const css = ['styles.css', 'threads/thread-composer.css', 'home/home.css']
  .map((f) => readFileSync(new URL(`../renderer/src/${f}`, import.meta.url), 'utf8')).join('\n');

const stand_in = `
  const call = () => Promise.resolve(Object.assign([], { ok: true }));
  window.zero = new Proxy({}, { get: (_, k) => (typeof k === 'string' && k.startsWith('on') ? () => () => {} : call) });`;

let browser, bundle;
beforeAll(async () => {
  if (!browserAvailable) return;
  bundle = (await build({
    stdin: { contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { HomePage } from './renderer/src/home/HomePage';
      const now = Date.now();
      const z = [0, 0, 0, 0, 0, 0, 0];
      const needs = [1, 2, 3, 4, 5].map((i) => ({ key: 'n' + i, letter: 'C', title: 'Row ' + i, from: null, priority: null, project: 'Team', at: now - i * 60000, unread: false }));
      const team = [1, 2, 3, 4].map((i) => ({ key: 'person:' + i, name: 'Person ' + i, letter: 'P', ai: false, line: 'Nothing running', state: 'quiet', week: z, total: 0 }));
      const words = window.WORDS;
      const slot = (el) => { if (el) el.innerHTML = '<div class="tc-card tc-inline"><textarea class="tc-text" style="height:' + words + 'px"></textarea>'
        + (window.PICTURES ? '<div class="attach-row" style="height:116px"></div>' : '') + '<div class="tc-bar" style="height:46px"></div></div>'; };
      createRoot(document.getElementById('root')).render(
        <HomePage hello="Good morning" now={now} needs={needs} needsCount={5} progressCount={0} team={team} progress={[]}
          slot={slot} onDoor={() => {}} onOpen={() => {}} onMember={() => {}} onTeam={() => {}} />);`,
    resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', logLevel: 'error',
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'empty', '.mp3': 'empty' },
  })).outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
}, 60_000);
afterAll(async () => { await browser?.close(); });

async function measure({ width = 1425, height = 884, words = 240, pictures = true } = {}) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.setDefaultTimeout(5_000);
  await page.route('http://home.test/**', (r) => r.fulfill({ contentType: 'text/html',
    body: `<style>${css}</style><div id="root" style="height:${height}px"></div>` }));
  await page.goto('http://home.test/');
  await page.addScriptTag({ content: `${stand_in} window.WORDS = ${words}; window.PICTURES = ${pictures};` });
  await page.addScriptTag({ content: bundle });
  await page.locator('.hm-start .tc-bar').waitFor();
  const m = await page.evaluate(() => {
    const box = (s) => document.querySelector(s).getBoundingClientRect();
    const pg = document.querySelector('.hm-page');
    return {
      overflow: pg.scrollHeight - pg.clientHeight,
      barInsideBox: box('.hm-start .tc-bar').bottom <= box('.hm-start').bottom + 0.5,
      words: box('.hm-start .tc-text').height,
      cards: box('.hm-two').height,
      helloTop: box('.hm-hello').top - box('.hm-page').top,
    };
  });
  await page.close();
  return m;
}

describe.skipIf(!browserAvailable)('a long message on Home', () => {
  it('keeps the box and both cards inside the window (the reported case)', async () => {
    const m = await measure();
    expect(m.overflow).toBeLessThanOrEqual(0);
    expect(m.barInsideBox).toBe(true);
    expect(m.cards).toBeGreaterThanOrEqual(240);
  }, 30_000);
  it('shows more than two lines of the message at that size', async () => {
    expect((await measure()).words).toBeGreaterThan(90);
  }, 30_000);
  it('leaves Home as it was when the message is short', async () => {
    const m = await measure({ words: 74, pictures: false });
    expect(m.cards).toBe(300);
    expect(m.words).toBe(74);
    expect(m.helloTop).toBeCloseTo(884 * 0.09, 0);
  }, 30_000);
});

describe.skipIf(!browserAvailable)('where the window cannot hold it all', () => {
  it('a very short window scrolls the page and never squeezes the bar out of the box', async () => {
    const m = await measure({ height: 520 });
    expect(m.barInsideBox).toBe(true);
    expect(m.words).toBeGreaterThanOrEqual(74);
    expect(m.overflow).toBeGreaterThan(0);
  }, 30_000);
  it('a narrow window, cards stacked, keeps the whole box and scrolls', async () => {
    const m = await measure({ width: 900 });
    expect(m.barInsideBox).toBe(true);
    expect(m.words).toBe(240);
    expect(m.cards).toBe(622);
  }, 30_000);
});
