// Home's Team this week had no way to choose who it shows: a founder wanted
// one teammate at the top and two who are not working on the company gone.
// Each row now has the ⋯ menu a conversation has in Messages. Rendered here
// with Home's real styles and pressed the way a person would.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium.executablePath());

const css = ['styles.css', 'home/home.css', 'team/chat.css']
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
      const z = [0, 0, 0, 0, 0, 0, 0];
      const mate = (key, name, extra = {}) => ({ key, name, letter: name[0], ai: false, line: 'Nothing running', state: 'quiet', week: z, total: 0, ...extra });
      const team = [mate('person:lena', 'Lena Ortiz', { pinned: true }), mate('person:sam', 'Sam Reyes')];
      const hidden = window.HIDDEN ? [mate('person:theo', 'Theo Brandt', { hidden: true }), mate('person:priya', 'Priya Raman', { hidden: true })] : [];
      window.ACTS = [];
      createRoot(document.getElementById('root')).render(
        <HomePage hello="Good morning" now={Date.now()} needs={[]} needsCount={0} progressCount={0} team={team} hiddenTeam={hidden} progress={[]}
          slot={() => {}} onDoor={() => {}} onOpen={() => {}} onMember={(k) => window.ACTS.push(['open', k])} onTeam={() => {}}
          onMate={window.NO_MENU ? undefined : (k, a) => window.ACTS.push([a, k])} />);`,
    resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', logLevel: 'error',
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'empty', '.mp3': 'empty' },
  })).outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
}, 60_000);
afterAll(async () => { await browser?.close(); });

async function open({ hidden = false, noMenu = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 1425, height: 884 } });
  page.setDefaultTimeout(5_000);
  await page.route('http://home.test/**', (r) => r.fulfill({ contentType: 'text/html', body: `<style>${css}</style><div id="root" style="height:884px"></div>` }));
  await page.goto('http://home.test/');
  await page.addScriptTag({ content: `${stand_in} window.HIDDEN = ${hidden}; window.NO_MENU = ${noMenu};` });
  await page.addScriptTag({ content: bundle });
  await page.locator('.hm-mate').first().waitFor();
  return page;
}
const row = (page, name) => page.locator('.hm-mate-wrap', { has: page.getByText(name, { exact: true }) });
const menuWords = (page) => page.locator('.chat-menu .chat-menu-row').allInnerTexts();
const acts = (page) => page.evaluate(() => window.ACTS);

describe.skipIf(!browserAvailable)('a teammate on Home is pinned or hidden from its menu', () => {
  it('hides a teammate from the ⋯ that shows when you point at their row (the reported case)', async () => {
    const page = await open();
    const more = row(page, 'Sam Reyes').locator('.hm-mate-more');
    expect(await more.isVisible()).toBe(false);
    await row(page, 'Sam Reyes').hover();
    expect(await more.isVisible()).toBe(true);
    await more.click();
    expect(await menuWords(page)).toEqual(['Pin to top', 'Hide from Home']);
    await page.getByRole('menuitem', { name: 'Hide from Home' }).click();
    expect(await acts(page)).toEqual([['hide', 'person:sam']]);
    expect(await page.locator('.chat-menu').count()).toBe(0);
    await page.close();
  }, 30_000);

  it('marks a pinned teammate beside their name and offers to unpin them', async () => {
    const page = await open();
    expect(await row(page, 'Lena Ortiz').locator('.hm-pin').count()).toBe(1);
    expect(await row(page, 'Sam Reyes').locator('.hm-pin').count()).toBe(0);
    await row(page, 'Lena Ortiz').hover();
    await row(page, 'Lena Ortiz').locator('.hm-mate-more').click();
    expect(await menuWords(page)).toEqual(['Unpin', 'Hide from Home']);
    await page.close();
  }, 30_000);

  it('opens the same menu on a right click, and a plain click still opens the teammate', async () => {
    const page = await open();
    await row(page, 'Sam Reyes').click({ button: 'right' });
    expect(await menuWords(page)).toEqual(['Pin to top', 'Hide from Home']);
    await page.keyboard.press('Escape');
    await row(page, 'Sam Reyes').locator('.hm-mate').click();
    expect(await acts(page)).toEqual([['open', 'person:sam']]);
    await page.close();
  }, 30_000);

  it('says how many are hidden, lists them when asked, and offers to show each on Home again', async () => {
    const page = await open({ hidden: true });
    const foot = page.locator('.hm-hidden');
    expect((await foot.innerText()).trim()).toBe('2 hidden');
    expect(await page.getByText('Theo Brandt').count()).toBe(0);
    await foot.click();
    expect(await row(page, 'Theo Brandt').getAttribute('class')).toContain('gone');
    await row(page, 'Theo Brandt').hover();
    await row(page, 'Theo Brandt').locator('.hm-mate-more').click();
    expect(await menuWords(page)).toEqual(['Show on Home']);
    await page.getByRole('menuitem', { name: 'Show on Home' }).click();
    expect(await acts(page)).toEqual([['show', 'person:theo']]);
    await page.close();
  }, 30_000);

  it('shows no hidden line when nobody is hidden, and no ⋯ where nothing handles it', async () => {
    const page = await open();
    expect(await page.locator('.hm-hidden').count()).toBe(0);
    await page.close();
    const bare = await open({ noMenu: true });
    expect(await bare.locator('.hm-mate-more').count()).toBe(0);
    await bare.locator('.hm-mate-wrap').first().click({ button: 'right' });
    expect(await bare.locator('.chat-menu').count()).toBe(0);
    await bare.close();
  }, 30_000);
});
