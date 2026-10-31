// Pressing E sometimes left an empty window until ⌘R. The screenshot's stack,
// decoded against the build that crashed, throws React error #185 from the
// ↵ Open task plate's layout effect hiding a plate that was already hidden.
// That set changed nothing, but React still scheduled a render for it, so when
// something else started an update loop (a focus change made inside an effect,
// whose focus handler sets state), the loop's last render was thrown from
// inside the commit and React unmounted the whole screen. Measured in Chromium
// with React 18.3: the same focus loop on its own throws and the screen stays
// drawn; with the old plate effect beside it the root comes back empty.
import { describe, it, expect, beforeEach } from 'vitest';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium.executablePath());

const page = (body) => `
  import React, {useEffect, useRef, useState} from 'react';
  import {createRoot} from 'react-dom/client';
  import {useLessonPlace} from './renderer/src/lesson-position';
  window.__renders = 0;
  window.__place = null;
  ${body}
  createRoot(document.getElementById('root')).render(<Screen />);`;

const mount = async (browser, body) => {
  const bundle = await build({
    stdin: { contents: page(body), resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const tab = await browser.newPage();
  const errors = [];
  tab.on('pageerror', (e) => errors.push(e.message));
  await tab.setContent('<div id="root"></div>');
  await tab.addScriptTag({ content: bundle.outputFiles[0].text });
  return { tab, errors };
};

// Two boxes that hand focus back and forth from an effect, each focus setting
// state, the way a loop elsewhere in the app reaches the plate's inputs.
const LOOP = `
  function Screen() {
    const [n, setN] = useState(0);
    const a = useRef(null), b = useRef(null);
    useLessonPlace(() => null, [n]);
    useEffect(() => { if (n > 0 && n < 400) (n % 2 ? a : b).current.focus(); }, [n]);
    useEffect(() => { window.go = () => setN(1); }, []);
    return <div><p id="inbox">The inbox</p>
      <input ref={a} onFocus={() => setN((x) => x + 1)} />
      <input ref={b} onFocus={() => setN((x) => x + 1)} /></div>;
  }`;

// The plate measuring a place the test sets, and counting renders.
const PLATE = `
  function Screen() {
    window.__renders += 1;
    const [tick, setTick] = useState(0);
    const at = useLessonPlace(() => window.__place, [tick]);
    window.__at = at;
    useEffect(() => { window.measure = () => setTick((t) => t + 1); }, []);
    return <p>{at ? at.left + ',' + at.top : 'hidden'}</p>;
  }`;

describe.skipIf(!browserAvailable)('the ↵ Open task plate in a real window', () => {
  let browser;
  beforeEach(async () => {
    browser = await chromium.launch({ headless: true });
    return () => browser.close();
  });

  it('a loop elsewhere is still reported but the screen stays drawn', async () => {
    const { tab, errors } = await mount(browser, LOOP);
    await tab.evaluate(() => window.go());
    await tab.waitForTimeout(300);
    expect(errors.some((m) => m.includes('#185'))).toBe(true);
    expect(await tab.evaluate(() => document.getElementById('inbox')?.textContent ?? null)).toBe('The inbox');
  });

  it('a hide while already hidden draws nothing again', async () => {
    const { tab } = await mount(browser, PLATE);
    await tab.waitForFunction(() => window.measure);
    const before = await tab.evaluate(() => window.__renders);
    await tab.evaluate(() => window.measure());
    await tab.waitForTimeout(50);
    // The measure itself renders once; the hide must add nothing to it.
    expect(await tab.evaluate(() => window.__renders)).toBe(before + 1);
    expect(await tab.evaluate(() => window.__at)).toBeNull();
  });

  it('the plate follows the row, keeps its place when the row did not move, and hides', async () => {
    const { tab } = await mount(browser, PLATE);
    await tab.waitForFunction(() => window.measure);
    const step = async (place) => {
      await tab.evaluate((p) => { window.__place = p; window.measure(); }, place);
      await tab.waitForTimeout(50);
      return tab.evaluate(() => ({ at: window.__at, renders: window.__renders }));
    };
    const shown = await step({ left: 20, top: 40 });
    expect(shown.at).toEqual({ left: 20, top: 40 });
    const same = await step({ left: 20, top: 40 });
    expect(same.renders).toBe(shown.renders + 1);
    const moved = await step({ left: 21, top: 40 });
    expect(moved.at).toEqual({ left: 21, top: 40 });
    const hidden = await step(null);
    expect(hidden.at).toBeNull();
  });
});
