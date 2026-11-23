// The founder pinned a thread and "nothing happened", and could not see which
// threads were pinned. Measured on a copy of the app: Pin thread from the
// thread's own ⋯ menu said nothing (only the command bar's Pin thread raised
// "Pinned to the top of your list"), Home's Needs you drew no pin at all, and
// the inbox drew a pin in its faintest grey after the title, where a long
// title cut it off.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium.executablePath());

const app = readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');

describe('pinning from a menu says so', () => {
  it('the thread\'s own ⋯ menu pins through the same step as the command bar (the reported case)', () => {
    expect(app).toMatch(/onPin=\{focused\.agent \? undefined : \(pin\) => pinFromMenu\(focused\.id, pin\)\}/);
    expect(app).toMatch(/case 'pin': pinFromMenu\(item\.id, d\.pin\); return;/);
  });
  it('that step pins and says which it did', () => {
    const step = app.match(/const pinFromMenu = [\s\S]*?\n {2}\};/)?.[0] ?? '';
    expect(step).toContain('pinThread(id, pin, true)');
    expect(step).toContain("'Pinned to the top of your list'");
    expect(step).toContain("'Unpinned'");
  });
  it('a drag across the pin line still pins without a word, as the row moving says it', () => {
    expect(app).toMatch(/if \(pin != null\) pinThread\(id, pin\);/);
  });
});

const css = ['styles.css', 'home/home.css', 'threads/pages.css']
  .map((f) => readFileSync(new URL(`../renderer/src/${f}`, import.meta.url), 'utf8')).join('\n');
const stand_in = `
  const call = () => Promise.resolve(Object.assign([], { ok: true }));
  window.zero = new Proxy({}, { get: (_, k) => (typeof k === 'string' && k.startsWith('on') ? () => () => {} : call) });`;
const LONG = 'Find out why the nightly import skipped Tuesday and Wednesday for the two largest customers in Europe';

let browser, bundle;
beforeAll(async () => {
  if (!browserAvailable) return;
  bundle = (await build({
    stdin: { contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { HomePage } from './renderer/src/home/HomePage';
      import { RowCells } from './renderer/src/threads/Pages';
      const now = Date.now();
      const need = (key, title, pinned) => ({ key, letter: 'C', agent: true, title, from: null, priority: null, project: 'Agentbox', at: now - 3600000, unread: false, pinned });
      const needs = [need('a', ${JSON.stringify(LONG)}, true), need('b', 'Fix the checkout timeout', true), need('c', 'Write the launch email', false)];
      const rows = [[${JSON.stringify(LONG)}, true], ['Fix the checkout timeout', true], ['Write the launch email', false]];
      createRoot(document.getElementById('root')).render(<>
        <HomePage hello="Good morning" now={now} needs={needs} needsCount={3} progressCount={0} team={null} progress={[]}
          slot={() => {}} onDoor={() => {}} onOpen={() => {}} onMember={() => {}} onTeam={() => {}} />
        <div className="th-table" style={{ width: 900 }}>{rows.map(([t, p]) => <div key={t} className="row" data-title={t}>
          <RowCells title={t} pinned={p} lock where="Agentbox" priority={5} updatedAt={now} now={now} />
        </div>)}</div>
      </>);`,
    resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', logLevel: 'error',
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'empty', '.mp3': 'empty' },
  })).outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
}, 120_000);
afterAll(async () => { await browser?.close(); });

async function open() {
  const page = await browser.newPage({ viewport: { width: 1425, height: 1200 } });
  page.setDefaultTimeout(5_000);
  await page.route('http://home.test/**', (r) => r.fulfill({ contentType: 'text/html', body: `<style>${css}</style><div id="root"></div>` }));
  await page.goto('http://home.test/');
  await page.addScriptTag({ content: stand_in });
  await page.addScriptTag({ content: bundle });
  await page.locator('.hm-row').first().waitFor();
  return page;
}

// Whether the pin is drawn inside what its row shows, not cut off past an ellipsis.
const pinSeen = (page, row) => row.evaluate((r) => {
  const pin = r.querySelector('[aria-label="Pinned"], svg.th-pin');
  if (!pin) return 'none';
  const box = pin.getBoundingClientRect();
  let clip = r.getBoundingClientRect();
  for (let el = pin.parentElement; el && el !== r.parentElement; el = el.parentElement) {
    if (getComputedStyle(el).overflow !== 'visible') { const b = el.getBoundingClientRect(); clip = { left: Math.max(clip.left, b.left), right: Math.min(clip.right, b.right) }; }
  }
  return box.width > 0 && box.left >= clip.left - 0.5 && box.right <= clip.right + 0.5 ? 'seen' : 'cut';
});

describe.skipIf(!browserAvailable)('a pinned thread wears its pin where you look', () => {
  it('on Home\'s Needs you, even when its title is too long for the row (the reported case)', async () => {
    const page = await open();
    const rows = page.locator('[aria-label="Needs you"] .hm-row');
    expect(await pinSeen(page, rows.nth(0))).toBe('seen');
    expect(await pinSeen(page, rows.nth(1))).toBe('seen');
    expect(await pinSeen(page, rows.nth(2))).toBe('none');
    await page.close();
  }, 30_000);

  it('in the inbox, after a title of any length', async () => {
    const page = await open();
    const rows = page.locator('.th-table .row');
    expect(await pinSeen(page, rows.nth(0))).toBe('seen');
    expect(await pinSeen(page, rows.nth(1))).toBe('seen');
    expect(await pinSeen(page, rows.nth(2))).toBe('none');
    await page.close();
  }, 30_000);

  it('in an ink that reads, not the faintest grey', async () => {
    const page = await open();
    const ink = await page.evaluate(() => {
      const probe = (v) => { const d = document.createElement('i'); d.style.color = `var(${v})`; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; };
      const pins = [...document.querySelectorAll('[aria-label="Pinned"], svg.th-pin')].map((p) => getComputedStyle(p).color);
      return { pins, faint: probe('--text-faint'), dim: probe('--text-dim') };
    });
    expect(ink.pins.length).toBe(4);
    for (const c of ink.pins) { expect(c).not.toBe(ink.faint); expect(c).toBe(ink.dim); }
    await page.close();
  }, 30_000);
});
