// A PRESS OUTSIDE A BOX CLOSES IT BEFORE THE BUTTON COMES UP.
//
// "Even when I click outside of the new task button, there is a tiny delay."
// Every box over the app (New task, ⌘K, the thread composer, the pickers)
// closed on `click`, which fires on the release: the box stayed up for as long
// as the button was held, about 90 ms for an ordinary click and longer for a
// slow one. Popovers already closed on the press (App.tsx's pointerdown), so
// the two kinds of box answered at different moments. Measured in Chromium
// with the built renderer: mousedown at 0 ms, box gone after mouseup at 92 ms.
//
// The backdrop now closes on the press itself, only for the main button and
// only when the press lands on the backdrop and not on the box.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { closesOnPress } from '../renderer/src/press.ts';

const press = (over: { button?: number; onBox?: boolean } = {}) => {
  const backdrop = {};
  const stopped = { yes: false };
  return {
    stopped,
    e: { button: over.button ?? 0, target: over.onBox ? {} : backdrop, currentTarget: backdrop, stopPropagation: () => { stopped.yes = true; } },
  };
};

describe('closesOnPress', () => {
  it('closes on the press of the main button on the backdrop', () => {
    let closed = 0;
    closesOnPress(() => { closed++; }).onMouseDown(press().e);
    expect(closed).toBe(1);
  });

  it('does not close on a press inside the box', () => {
    let closed = 0;
    closesOnPress(() => { closed++; }).onMouseDown(press({ onBox: true }).e);
    expect(closed).toBe(0);
  });

  it('does not close on the right or the middle button', () => {
    let closed = 0;
    const props = closesOnPress(() => { closed++; });
    props.onMouseDown(press({ button: 2 }).e);
    props.onMouseDown(press({ button: 1 }).e);
    expect(closed).toBe(0);
  });

  it('keeps the press from reaching what the box was opened over only when asked', () => {
    const kept = press(); closesOnPress(() => {}, { stop: true }).onMouseDown(kept.e);
    expect(kept.stopped.yes).toBe(true);
    const plain = press(); closesOnPress(() => {}).onMouseDown(plain.e);
    expect(plain.stopped.yes).toBe(false);
  });

  it('has no click handler left to close the box a second time', () => {
    expect(Object.keys(closesOnPress(() => {}))).toEqual(['onMouseDown']);
  });
});

const root = new URL('../renderer/src/', import.meta.url).pathname;
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : /\.tsx$/.test(n) ? [p] : [];
});

describe('every backdrop over the app', () => {
  const backdrops = walk(root).flatMap((file) => {
    const text = readFileSync(file, 'utf8');
    return [...text.matchAll(/<div className=\{?[`"]modal-backdrop[^>]*>/g)].map((m) => ({ file: file.slice(root.length), tag: m[0] }));
  });

  it('closes on the press, not on the click', () => {
    expect(backdrops.filter((b) => /onClick=|onMouseDown=/.test(b.tag))).toEqual([]);
    expect(backdrops.filter((b) => /closesOnPress\(/.test(b.tag)).length).toBeGreaterThanOrEqual(12);
  });

  it('leaves alone the one box nothing outside it may close', () => {
    const walkthrough = backdrops.filter((b) => b.file === 'components/ImportAgents.tsx' && /in-walk">/.test(b.tag));
    expect(walkthrough).toHaveLength(1);
  });
});

describe('in Chromium', async () => {
  const { createRequire } = await import('node:module');
  const { existsSync } = await import('node:fs');
  const { build } = await import('esbuild');
  let chromium: { launch: (o: object) => Promise<{ newPage: () => Promise<import('playwright').Page>; close: () => Promise<void> }>; executablePath: () => string } | undefined;
  try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch { /* no browser here */ }
  const can = !!chromium && existsSync(chromium.executablePath());

  it.skipIf(!can)('the box is gone while the button is still down, and the release presses nothing under it', async () => {
    const bundle = (await build({
      stdin: { contents: `
        import React, { useState } from 'react';
        import { createRoot } from 'react-dom/client';
        import { closesOnPress } from './renderer/src/press';
        const w = window as unknown as { under: number };
        w.under = 0;
        function App() {
          const [open, setOpen] = useState(true);
          return <>
            <button id="under" style={{ position: 'fixed', left: 0, top: 0, width: 200, height: 200 }} onClick={() => { w.under++; }}>under</button>
            {open && <div id="backdrop" style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center' }} {...closesOnPress(() => setOpen(false))}>
              <div id="box" style={{ width: 100, height: 100, background: 'grey' }}><input id="field" /></div>
            </div>}
          </>;
        }
        createRoot(document.getElementById('root')!).render(<App />);`,
      resolveDir: process.cwd(), loader: 'tsx' },
      bundle: true, write: false, format: 'iife', jsx: 'automatic', logLevel: 'error',
    })).outputFiles[0].text;
    const browser = await chromium!.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent('<div id="root"></div>');
      await page.addScriptTag({ content: bundle });
      await page.locator('#box').waitFor();
      const box = await page.locator('#box').boundingBox();
      await page.mouse.move(box!.x + 50, box!.y + 50);
      await page.mouse.down(); await page.mouse.up();
      expect(await page.locator('#box').count()).toBe(1);
      await page.mouse.move(100, 100);
      await page.mouse.down();
      expect(await page.locator('#box').count()).toBe(0);
      await page.mouse.up();
      expect(await page.evaluate(() => (window as unknown as { under: number }).under)).toBe(0);
      await page.mouse.click(100, 100);
      expect(await page.evaluate(() => (window as unknown as { under: number }).under)).toBe(1);
    } finally { await browser.close(); }
  }, 60_000);
});
