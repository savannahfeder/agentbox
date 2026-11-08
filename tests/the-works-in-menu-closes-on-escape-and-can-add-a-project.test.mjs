// QA batch 011, Oct 30, 2026, on the New teammate page:
// - F-185: with the Works in menu open, one Escape closed the menu and also
//   left the teammate chat, because the menu had no Escape of its own and the
//   window's Escape leaves the page.
// - F-186: the menu offered My Workspace, which a teammate cannot work in (the
//   app quietly put it elsewhere), and no way to add a project.
// - F-187: a teammate being set up showed a guessed schedule it was asking about.
// - F-188: the Teammates switch in Settings showed nothing until the app had
//   saved, so a slow save read as a click that did not land.
// Drawn in Chromium from the real components, with a window Escape listener
// standing in for the app's own.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium.executablePath());

let browser, page, bundle;

beforeAll(async () => {
  if (!browserAvailable) return;
  bundle = (await build({
    stdin: { contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { TeammatesPage } from './renderer/src/teammates/TeammatesPage';
      import { Switch } from './renderer/src/components/Settings';
      const call = () => Promise.resolve(Object.assign([], { ok: true }));
      window.zero = new Proxy({}, { get: (_, k) => (typeof k === 'string' && k.startsWith('on') ? () => () => {} : call) });
      window.escapes = 0;
      window.newProject = 0;
      window.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.escapes += 1; });
      const products = [
        { slug: 'chunk-js', name: 'Chunk JS', repoPath: '/r/chunk-js' },
        { slug: 'truncate-js', name: 'Truncate JS', repoPath: '/r/truncate-js' },
        { slug: 'my-workspace', name: 'My Workspace', personal: true },
      ];
      function Slow() {
        const [on, setOn] = React.useState(false);
        return <Switch label="Teammates" on={on} onChange={(v) => new Promise((r) => setTimeout(() => { setOn(v); r(); }, 800))} />;
      }
      const status = location.hash.slice(1);
      const chief = { id: 't-c0c0c0', name: 'Chief of staff', letter: 'C', status, memory: [], duties: [], works: { every: 'weekday', at: '09:00' },
        waiting: [], next: [], done: [], queued: 0, running: null, now: null, runsThisWeek: 1, limit: 20, product: 'chunk-js', playbooks: [] };
      createRoot(document.getElementById('root')).render(<>
        <TeammatesPage view={{ list: status ? [chief] : [], chat: [], runs: [] }} open={status ? 'sheet:t-c0c0c0' : 'new'} products={products} engines={[]} me="You"
          onOpen={() => {}} onOpenThread={() => {}} onChanged={() => {}} onNewProject={() => { window.newProject += 1; }} />
        <Slow />
      </>);`,
    resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', logLevel: 'error',
    // Vite's file lists, which esbuild does not have and nothing here draws.
    banner: { js: 'globalThis.__noGlob = () => ({});' },
    define: { 'import.meta.glob': 'globalThis.__noGlob' },
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'empty', '.mp3': 'empty' },
  })).outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
}, 60_000);
afterAll(async () => { await browser?.close(); });
beforeEach(async () => {
  if (!browserAvailable) return;
  await page?.close();
  page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  page.setDefaultTimeout(5_000);
  await page.route('http://menu.test/**', (r) => r.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
  await page.goto('http://menu.test/');
  await page.addScriptTag({ content: bundle });
});

const worksIn = () => page.locator('button[aria-label="Works in"]');
const menu = () => page.getByRole('listbox', { name: 'Works in' });

describe.skipIf(!browserAvailable)('the Works in menu', () => {
  it('Escape closes the menu and nothing else', async () => {
    await worksIn().click();
    await expect.poll(() => menu().count()).toBe(1);
    await page.keyboard.press('Escape');
    await expect.poll(() => menu().count()).toBe(0);
    expect(await page.evaluate(() => window.escapes)).toBe(0);
    // With the menu shut, Escape is the page's again.
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => window.escapes)).toBe(1);
  });

  it('lists the projects a teammate can work in, not My Workspace, and ends with New project', async () => {
    await worksIn().click();
    const rows = await menu().getByRole('option').allTextContents();
    expect(rows).toEqual(['Chunk JS', 'Truncate JS', '+ New project']);
    await menu().getByRole('option', { name: '+ New project' }).click();
    expect(await page.evaluate(() => window.newProject)).toBe(1);
    await expect.poll(() => menu().count()).toBe(0);
  });
});

// F-187: while setting up, it showed "Weekdays at 9:00am" for a schedule it
// was asking you about, and you had answered "only when you message me".
describe.skipIf(!browserAvailable)('a teammate\'s About sheet', () => {
  const sheetFor = async (status) => {
    await page.goto(`http://menu.test/#${status}`);
    await page.addScriptTag({ content: bundle });
    return page.getByRole('dialog', { name: 'About Chief of staff' });
  };
  it('shows no schedule while it is still being set up, and shows it once it is', async () => {
    const draft = await sheetFor('draft');
    await expect.poll(() => draft.count()).toBe(1);
    expect(await draft.getByText('On its own').count()).toBe(0);
    const active = await sheetFor('active');
    await expect.poll(() => active.count()).toBe(1);
    expect(await active.getByText('On its own').count()).toBe(1);
  });
});

describe.skipIf(!browserAvailable)('a Settings switch', () => {
  it('flips on the click, before the save answers, and stays where the save left it', async () => {
    const sw = page.getByRole('switch', { name: 'Teammates' });
    await sw.click();
    expect(await sw.getAttribute('aria-checked')).toBe('true');
    await page.waitForTimeout(1200);
    expect(await sw.getAttribute('aria-checked')).toBe('true');
  });
});
