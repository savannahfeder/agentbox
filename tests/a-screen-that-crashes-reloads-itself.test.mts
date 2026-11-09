// Pressing E to close a thread sometimes left an empty white window, and only
// ⌘R brought it back. The founder's screenshot shows React error #185 (an
// update loop) thrown from a layout effect with no error boundary anywhere, so
// React unmounted the whole screen. Measured by mounting a component that
// loops the same way under ScreenCrash in Chromium: before, the root was empty;
// now the screen writes the held close, reloads itself, and only stops to ask
// when its own reload crashes again within a minute.
import { describe, it, expect, beforeEach } from 'vitest';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { afterACrash, cameBackFromACrash, CRASH_LOOP_MS, CRASH_RELOAD_KEY } from '../renderer/src/after-a-crash.ts';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium.executablePath());

const memory = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

describe('after a crash, reload once and never in a loop', () => {
  let store;
  let s;
  beforeEach(() => { store = memory(); s = () => store; });

  it('the first crash reloads', () => {
    expect(afterACrash(1_000_000, s)).toBe('reload');
    expect(store.getItem(CRASH_RELOAD_KEY)).toBe('1000000');
  });

  it('a crash just inside a minute of its own reload stays and asks', () => {
    afterACrash(1_000_000, s);
    expect(afterACrash(1_000_000 + CRASH_LOOP_MS - 1, s)).toBe('stay');
  });

  it('a crash a minute or more later reloads again', () => {
    afterACrash(1_000_000, s);
    expect(afterACrash(1_000_000 + CRASH_LOOP_MS, s)).toBe('reload');
  });

  it('a mark that is not a time does not hold the reload back', () => {
    store.setItem(CRASH_RELOAD_KEY, 'nonsense');
    expect(afterACrash(1_000_000, s)).toBe('reload');
  });

  it('a store that cannot be read stays rather than risk a reload loop', () => {
    expect(afterACrash(1_000_000, () => { throw new Error('Access is denied'); })).toBe('stay');
    expect(cameBackFromACrash(1_000_000, () => { throw new Error('Access is denied'); })).toBe(false);
  });

  it('the page the reload drew says so once, and a later page does not', () => {
    afterACrash(1_000_000, s);
    expect(cameBackFromACrash(1_000_000 + 60_000, s)).toBe(false);
    expect(cameBackFromACrash(1_000_500, s)).toBe(true);
    expect(cameBackFromACrash(1_000_600, s)).toBe(false);
  });
});

// The same loop as the crash: a layout effect that sets state every render.
const page = (screen, prelude = '') => `${prelude}
  import React, {useLayoutEffect, useState} from 'react';
  import {createRoot} from 'react-dom/client';
  import {ScreenCrash} from './renderer/src/components/ScreenCrash';
  import {keepHeldWriter} from './renderer/src/after-a-crash';
  window.__order = [];
  keepHeldWriter(async () => { window.__order.push('wrote the held close'); });
  function Loops() { const [n, setN] = useState(0); useLayoutEffect(() => { setN(n + 1); }); return <p>{n}</p>; }
  function Fine() { return <p id="fine">The inbox</p>; }
  createRoot(document.getElementById('root')).render(
    <ScreenCrash reload={() => window.__order.push('reloaded')} report={(e) => window.__order.push('reported ' + e.message.slice(0, 30))}>
      ${screen === 'loops' ? '<Loops />' : '<Fine />'}
    </ScreenCrash>);`;

const mount = async (browser, screen, prelude) => {
  const bundle = await build({
    stdin: { contents: page(screen, prelude), resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', loader: { '.css': 'empty' }, jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const tab = await browser.newPage();
  // A real origin, because a blank page has no session storage.
  await tab.route('http://screen.test/', (r) => r.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
  await tab.goto('http://screen.test/');
  await tab.addScriptTag({ content: bundle.outputFiles[0].text });
  return tab;
};

describe.skipIf(!browserAvailable)('a screen that throws in the window', () => {
  let browser;
  beforeEach(async () => {
    browser = await chromium.launch({ headless: true });
    return () => browser.close();
  });

  it('reports, writes the held close, then reloads instead of going blank', async () => {
    const tab = await mount(browser, 'loops');
    await tab.waitForFunction(() => window.__order.includes('reloaded'));
    const order = await tab.evaluate(() => window.__order);
    expect(order[0]).toMatch(/^reported Minified React error #185/);
    expect(order.slice(1)).toEqual(['wrote the held close', 'reloaded']);
    expect(await tab.locator('#root').innerHTML()).not.toBe('');
  });

  it('stays and says to press the reload keys when its own reload crashed again', async () => {
    const tab = await mount(browser, 'loops', `sessionStorage.setItem('${CRASH_RELOAD_KEY}', String(Date.now() - 5000));`);
    await expect(tab.getByRole('alert').textContent()).resolves.toMatch(/hit an error twice in a row\. Press .+R to reload it\./);
    await tab.waitForTimeout(300);
    expect(await tab.evaluate(() => window.__order)).not.toContain('reloaded');
  });

  it('a screen that does not throw is drawn as it was', async () => {
    const tab = await mount(browser, 'fine');
    await expect(tab.locator('#fine').textContent()).resolves.toBe('The inbox');
    expect(await tab.evaluate(() => window.__order)).toEqual([]);
  });
});
