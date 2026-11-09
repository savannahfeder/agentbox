// THE REPLY BAR NEVER CUTS A CHIP THROUGH ITS EDGE (w-1759129d81).
//
// Two fixes (w-603fcad8c7, w-61415acc87) made the reply box beside an open file
// fit, but only for the one bar their test drew: "Auto" and "Opus 5.5" with no
// level. A thread set to a level reads "Opus 5.5 · Extra", and at the 400px
// conversation the bar needed 372px of a 336px card. Every chip shrank with its
// overflow hidden, so "Auto" lost its right padding and the model read
// "Opus 5.5 · Ext" sliced by its own border; the priority chip lost 6px too.
//
// Now the bar stays one row. A narrow box leaves the level to the model's menu;
// when the chips still do not fit, the mode chip goes; only after that does the
// model's name end in an ellipsis. Every mode name is drawn against short and
// long models, with and without a level, at that floor, wide, and on a phone,
// in the app's own font.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium.executablePath());

const css = ['styles.css', 'workspace-navigation.css', 'threads/thread-composer.css', 'one-thing-at-a-time.css', 'narrow-conversation.css']
  .map((f) => readFileSync(new URL(`../renderer/src/${f}`, import.meta.url), 'utf8')).join('\n');
const stand_in = `
  const call = () => Promise.resolve(Object.assign([], { ok: true }));
  window.zero = new Proxy({}, { get: (_, k) => (typeof k === 'string' && k.startsWith('on') ? () => () => {} : call) });`;

const MODES = ['auto', 'default', 'acceptEdits', 'plan', 'dontAsk', 'bypassPermissions'];

let browser, bundle;
beforeAll(async () => {
  if (!browserAvailable) return;
  bundle = (await build({
    stdin: { contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { Focus } from './renderer/src/components/Focus';
      const root = createRoot(document.getElementById('root'));
      let n = 0;
      window.draw = ({ mode, model, effort }) => {
        const now = Date.now();
        const item = { product: 'site', id: 'w-012345678' + (n++ % 10), title: 'Ship the Later menu fix?', body: 'Ship it?', status: 'open', kind: 'review', labels: [], priority: 5,
          model, effort, createdAt: now - 60000, updatedAt: now - 60000 };
        root.render(
          <Focus key={item.id + n} item={item} onePage replyOpen live={{}} session={null} runningMode={mode} runningEngine="claude"
            engines={[{ id: 'claude', label: 'Claude Code' }]} items={[item]}
            onClose={() => {}} onReply={() => {}} onReplyClose={() => {}} onNotice={() => {}} onStop={() => {}} onReplySend={() => {}} />);
      };`,
    resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', logLevel: 'error',
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'empty', '.mp3': 'empty' },
  })).outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
}, 60_000);
afterAll(async () => { await browser?.close(); });

async function open(width, viewport) {
  const page = await browser.newPage({ viewport });
  page.setDefaultTimeout(5_000);
  await page.route('http://fits.test/**', (r) => r.fulfill({ contentType: 'text/html',
    body: `<style>${css} #root > * { min-width: 0; }</style><div id="root" style="width:${width}px;height:900px;display:flex;overflow:hidden"></div>` }));
  await page.route('http://fits.test/assets/**', (r) => r.fulfill({ body: readFileSync(new URL(`../renderer/src${new URL(r.request().url()).pathname}`, import.meta.url)) }));
  await page.goto('http://fits.test/');
  await page.addScriptTag({ content: stand_in });
  await page.addScriptTag({ content: bundle });
  return page;
}

async function measure(page, setup) {
  await page.evaluate((s) => window.draw(s), { effort: null, ...setup });
  await page.locator('.dock-input').fill('??? waiting');
  await page.locator('.dock-send:not(:disabled)').waitFor();
  await page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));
  return page.evaluate(() => {
    const box = (e) => e.getBoundingClientRect();
    const mid = (e) => Math.round(box(e).top + box(e).height / 2);
    const card = box(document.querySelector('.dock-card'));
    const chips = [...document.querySelectorAll('.dock-chips .tc-chip')].filter((c) => getComputedStyle(c).visibility === 'visible');
    const actions = [...document.querySelectorAll('.dock-bar .dock-clip, .dock-bar .dock-send, .dock-bar .dock-send-later')];
    const ends = [...chips, ...actions].map(box);
    const labels = chips.flatMap((c) => [...c.querySelectorAll('.tc-chip-label')]);
    return {
      // A chip's content wider than the chip is what drew the slice.
      sliced: chips.filter((c) => c.scrollWidth > c.clientWidth + 1).map((c) => c.textContent),
      cutWithoutEllipsis: labels.filter((l) => l.scrollWidth > l.clientWidth + 1 && getComputedStyle(l).textOverflow !== 'ellipsis').map((l) => l.textContent),
      unevenPadding: chips.filter((c) => { const s = getComputedStyle(c); return s.paddingLeft !== s.paddingRight; }).map((c) => c.textContent),
      shortened: labels.filter((l) => l.scrollWidth > l.clientWidth + 1).map((l) => l.textContent),
      modeShown: !document.querySelector('.dock-chips .mode-pick.folded'),
      shown: chips.filter((c) => !c.querySelector('.tc-prio')).map((c) => c.innerText.trim()),
      rows: new Set([...chips, ...actions].map(mid)).size,
      fits: ends.every((r) => r.left >= card.left - 0.5 && r.right <= card.right + 0.5),
      edges: [Math.round(Math.min(...ends.map((r) => r.left)) - card.left), Math.round(card.right - Math.max(...ends.map((r) => r.right)))],
    };
  });
}

const holdsTogether = (m) => {
  expect(m.sliced).toEqual([]);
  expect(m.cutWithoutEllipsis).toEqual([]);
  expect(m.unevenPadding).toEqual([]);
  expect(m.rows).toBe(1);
  expect(m.fits).toBe(true);
  expect(Math.abs(m.edges[0] - m.edges[1])).toBeLessThanOrEqual(1);
};

describe.skipIf(!browserAvailable)('beside an open file, at the 400px conversation', () => {
  let page;
  beforeAll(async () => { page = await open(400, { width: 1200, height: 900 }); }, 30_000);
  afterAll(async () => { await page?.close(); });

  it('draws "Auto" and "Opus 5.5" whole on one row, the level left to the menu', async () => {
    const m = await measure(page, { mode: 'auto', model: 'opus', effort: 'xhigh' });
    holdsTogether(m);
    expect(m.shortened).toEqual([]);
    expect(m.shown).toEqual(['Auto', 'Opus 5.5']);
  });

  it('lets the mode go, not the model, when the two do not fit', async () => {
    const m = await measure(page, { mode: 'acceptEdits', model: 'sonnet', effort: 'xhigh' });
    holdsTogether(m);
    expect(m.modeShown).toBe(false);
    expect(m.shown).toEqual(['Sonnet 5.5']);
    expect(m.shortened).toEqual([]);
  });

  it('brings the mode back when a shorter one fits again', async () => {
    await measure(page, { mode: 'acceptEdits', model: 'sonnet', effort: 'xhigh' });
    const m = await measure(page, { mode: 'plan', model: 'opus', effort: 'xhigh' });
    expect(m.shown).toEqual(['Plan', 'Opus 5.5']);
  });

  for (const mode of MODES) {
    for (const [model, effort] of [['haiku', null], ['opus', 'high'], ['sonnet', 'xhigh']]) {
      it(`never slices a chip with mode ${mode} and ${model}${effort ? ` at ${effort}` : ''}`, async () => {
        const m = await measure(page, { mode, model, effort });
        holdsTogether(m);
        // The model's name is shortened only after the mode has gone.
        if (m.shortened.length) expect(m.modeShown).toBe(false);
      });
    }
  }
});

describe.skipIf(!browserAvailable)('the same bar with room, 900px wide', () => {
  it('shows the mode and the level, and shortens nothing', async () => {
    const page = await open(900, { width: 1200, height: 900 });
    const m = await measure(page, { mode: 'bypassPermissions', model: 'sonnet', effort: 'xhigh' });
    await page.close();
    holdsTogether(m);
    expect(m.shown).toEqual(['Bypass Permissions', 'Sonnet 5.5 · Extra']);
    expect(m.shortened).toEqual([]);
  }, 30_000);
});

describe.skipIf(!browserAvailable)('on a phone, 390px wide', () => {
  it('slices no chip either', async () => {
    const page = await open(390, { width: 390, height: 844 });
    const m = await measure(page, { mode: 'auto', model: 'opus', effort: 'xhigh' });
    await page.close();
    expect(m.sliced).toEqual([]);
    expect(m.cutWithoutEllipsis).toEqual([]);
    expect(m.fits).toBe(true);
  }, 30_000);
});
