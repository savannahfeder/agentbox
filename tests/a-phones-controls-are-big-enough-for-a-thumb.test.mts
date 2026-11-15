// A PHONE'S CONTROLS ARE BIG ENOUGH FOR A THUMB, AND ITS INBOX WORDS READABLE.
//
// What broke (QA batch 005, F-121, measured on the hosted phone site at
// 360-390px): "the 1 OF N arrows, Back arrow and top-bar icons measure about
// 10-14 px. Tab bar text is small and light grey." The boxes were the
// desktop's — 24px for the back arrow, 30px for the step arrows and the dots —
// and the ink inside them 15-16px, which is what a finger finds. Apple and
// Google both put the floor at 44pt / 48dp.
//
// Measured here the way the report measured it: the real components under the
// real stylesheets in Chromium at 390px, asking each control for its own box.
import { describe, it, expect } from 'vitest';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium?.executablePath?.() ?? '');

// The floor both phone platforms publish. 44 is the smaller of the two.
const THUMB = 44;

const SHEETS = [
  'renderer/src/styles.css',
  'renderer/src/workspace-navigation.css',
  'renderer/src/threads/pages.css',
  'renderer/src/threads/summary.css',
  'renderer/src/one-thing-at-a-time.css',
  'renderer/src/phone.css',
];

async function phoneScreen({ open = true } = {}) {
  const bundle = await build({
    stdin: {
      contents: `import React from 'react';
        import {createRoot} from 'react-dom/client';
        import {QueueNav} from './renderer/src/components/OneThingAtATime';
        import {ThreadMenu} from './renderer/src/threads/ThreadMenu';
        // A thread open, or the inbox: on the phone the side rail's gear is
        // hidden while a thread is open, so the two screens are measured apart.
        const open = window.__threadOpen !== false;
        function Page() {
          return <div className={open ? 'app workspace-layout workspace-task' : 'app workspace-layout'}>
            {/* The DOM the phone really draws: the thread's crumb and its
                corner in the top bar, the gear in the side rail, and search
                and the inboxes in the list's own bar. */}
            <div className="topbar">
              {open && <div className="workspace-task-header"><div className="thread-crumb">
                <button className="back-esc thread-crumb-back" aria-label="Back to Needs you (esc)">
                  <svg viewBox="0 0 16 16"><path d="M10 3.5L5.5 8l4.5 4.5" /></svg>
                  <span className="thread-crumb-from">Needs you</span>
                </button>
                <span className="thread-crumb-sep">/</span>
                <button className="thread-crumb-name" aria-label="Rename this thread">README Usage section</button>
              </div></div>}
              <div className="th-right">
                <button className="th-disp" aria-label="View and filters"><svg viewBox="0 0 16 16" /></button>
              </div>
              {open && <span className="ts-top">
                <QueueNav spot={{ pos: 1, total: 4, index: 0 }} onStep={() => {}} />
                <ThreadMenu onFinish={() => {}} onLater={() => {}} />
              </span>}
            </div>
            <div className="workspace-navigation"><div className="workspace-bottom"><div className="workspace-utilities">
              <button aria-label="Settings"><svg viewBox="0 0 24 24" /></button>
            </div></div></div>
            <div className="body"><div className="list-pane">
              <div className="th-bar">
                <button className="th-search" aria-label="Search"><svg viewBox="0 0 16 16" /><span>Search</span></button>
                <div className="tm-tabs">
                  <button className="tm-tab on">Needs you <b>3</b></button>
                  <button className="tm-tab">In progress <b>1</b></button>
                  <button className="tm-tab">Later</button>
                  <button className="tm-tab">Done</button>
                </div>
              </div>
            </div></div>
          </div>;
        }
        createRoot(document.getElementById('root')).render(<Page />);`,
      resolveDir: process.cwd(), loader: 'tsx',
    },
    bundle: true, write: false, format: 'iife', jsx: 'automatic',
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl' },
  });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.setContent(`<html data-theme="dark" data-door="phone"><body>
    <script>window.__threadOpen = ${open}</script><div id="root"></div></body></html>`);
  for (const path of SHEETS) await page.addStyleTag({ path });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  return { browser, page };
}

const box = (page, sel) => page.locator(sel).first().evaluate((el) => {
  const r = el.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height) };
});

describe.skipIf(!browserAvailable)('what a thumb has to hit', () => {
  const everyOneOf = async (screen, selectors) => {
    const { browser, page } = await phoneScreen(screen);
    try {
      for (const sel of selectors) {
        const { w, h } = await box(page, sel);
        expect(w, `${sel} is ${w}px wide`).toBeGreaterThanOrEqual(THUMB);
        expect(h, `${sel} is ${h}px tall`).toBeGreaterThanOrEqual(THUMB);
      }
    } finally { await browser.close(); }
  };

  it('is at least 44px square on every control in a thread\'s bar', () => everyOneOf({ open: true },
    ['.thread-crumb-back', '.one-step', '.ts-done', '.ts-more-wrap .ts-more']));

  // The inbox's corner. Its gear is hidden while a thread is open, so it is
  // measured on the screen it is actually drawn on.
  it('and on every icon in the inbox\'s corner', () => everyOneOf({ open: false },
    ['.th-bar > .th-search', '.topbar .th-disp', '.workspace-navigation button[aria-label="Settings"]']));

  it('is at least 44px tall on every inbox word under the title', async () => {
    const { browser, page } = await phoneScreen();
    try {
      const heights = await page.locator('.tm-tab').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
      expect(heights.length).toBe(4);
      for (const h of heights) expect(h).toBeGreaterThanOrEqual(THUMB);
    } finally { await browser.close(); }
  });

  // The boundary on the other side: the inboxes must still FIT. Four of them
  // plus their counts ran 412px on a 393px phone once already (the-web-app-
  // fits-a-phone), and bigger targets must not bring that back.
  it('without the inboxes running off the side of the screen', async () => {
    const { browser, page } = await phoneScreen();
    try {
      const over = await page.evaluate(() => [...document.querySelectorAll('.tm-tab')]
        .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 0.5).length);
      expect(over).toBe(0);
    } finally { await browser.close(); }
  });
});

describe.skipIf(!browserAvailable)('and nothing moved to make room', () => {
  // The bigger boxes took room that was already empty. Measured against the
  // rules they replaced: the chevron's ink and the title beside it, to the
  // pixel. The inbox words were measured here too until they moved up under
  // the title on purpose (2026-10-28); where they sit now is
  // the-web-app-on-a-phone-matches-the-phone-apps-text-and-tabs.
  const AS_IT_WAS = `:root:root:root:root .workspace-task-header > .thread-crumb { height: 28px; overflow: hidden; }
    :root:root:root:root .thread-crumb > .back-esc.thread-crumb-back { height: 28px; min-width: 0; margin-left: 0; padding: 4px 8px 4px 4px; align-items: center; }
    :root:root:root:root button.thread-crumb-name { height: 28px; }`;

  const places = (page) => page.evaluate(() => {
    const off = (el, from) => [Math.round(el.left - from.left), Math.round(el.top - from.top)];
    // Against the BAR, which is a fixed 56 either way. The header inside it is
    // as tall as its tallest child and centres, so it is not a fixed origin.
    const head = document.querySelector('.topbar').getBoundingClientRect();
    const ink = document.querySelector('.thread-crumb-back svg').getBoundingClientRect();
    const name = document.querySelector('.thread-crumb-name').getBoundingClientRect();
    const nameMid = [Math.round(name.left - head.left), Math.round(name.top + name.height / 2 - head.top)];
    return { bar: Math.round(head.height), ink: off(ink, head), name: nameMid };
  });

  it('the back arrow and the thread name sit where they always did', async () => {
    const { browser, page } = await phoneScreen();
    try {
      const now = await places(page);
      await page.addStyleTag({ content: AS_IT_WAS });
      const before = await places(page);
      expect(now.bar).toBe(before.bar);
      expect(now.ink).toEqual(before.ink);
      // The box reaches further left and down; the name beside it keeps its
      // place and its middle line, because the negative margin gives back
      // exactly the width the 44px minimum added.
      expect(now.name).toEqual(before.name);
    } finally { await browser.close(); }
  });
});

describe.skipIf(!browserAvailable)('the inbox words', () => {
  it('are bright enough to read, picked or not', async () => {
    const { browser, page } = await phoneScreen();
    try {
      const inks = await page.locator('.tm-tab').evaluateAll((els) => els.map((el) => {
        const s = getComputedStyle(el);
        return { size: parseFloat(s.fontSize), color: s.color };
      }));
      const lum = ([r, g, b]) => {
        const c = [r, g, b].map((v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : (((v / 255) + 0.055) / 1.055) ** 2.4));
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      };
      const wall = lum([26, 24, 23]);
      for (const ink of inks) {
        const text = lum(ink.color.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number));
        // 3:1, the floor WCAG sets for large and for interface text.
        expect((Math.max(text, wall) + 0.05) / (Math.min(text, wall) + 0.05)).toBeGreaterThanOrEqual(3);
        expect(ink.size).toBeGreaterThanOrEqual(15);
      }
    } finally { await browser.close(); }
  });
});
