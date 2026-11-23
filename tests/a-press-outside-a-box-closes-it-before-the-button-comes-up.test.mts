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
//
// The scan used to demand at least 12 backdrops, and went red when Pro took
// the Start a team box away (11 left). It now finds every class that names
// modal-backdrop and reads each tag to its real end, so a raw click after an
// `() =>` is seen too.
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

// The whole opening tag, to its real end: a `>` inside `{...}` or a string
// (as in `() =>`) does not close it.
const openingTag = (text: string, start: number): string => {
  const open: string[] = [];
  for (let i = start; i < text.length; i++) {
    const c = text[i], mode = open[open.length - 1];
    if (mode === '"' || mode === "'") { if (c === '\\') i++; else if (c === mode) open.pop(); continue; }
    if (mode === '`') {
      if (c === '\\') i++;
      else if (c === '`') open.pop();
      else if (c === '$' && text[i + 1] === '{') { open.push('{'); i++; }
      continue;
    }
    if (c === '"' || c === "'" || c === '`' || c === '{') open.push(c);
    else if (c === '}') open.pop();
    else if (c === '>' && !open.length) return text.slice(start, i + 1);
  }
  return text.slice(start);
};

const backdropsIn = (text: string, file = '') =>
  [...text.matchAll(/className=\{?[`"'][^`"']*?(?<![\w-])modal-backdrop(?![\w-])/g)]
    .map((m) => ({ file, tag: openingTag(text, text.lastIndexOf('<', m.index)) }));

const wrong = (backdrops: { file: string; tag: string }[]) => ({
  rawPress: backdrops.filter((b) => /\bon(Click|MouseDown|MouseUp|PointerDown|PointerUp)=/.test(b.tag)),
  noClose: backdrops.filter((b) => !/closesOnPress\(/.test(b.tag) && !(b.file === 'components/ImportAgents.tsx' && /in-walk">$/.test(b.tag))),
  walks: backdrops.filter((b) => /in-walk">$/.test(b.tag)),
});

describe('the backdrop scan', () => {
  it('finds a raw click written after an arrow function in the same tag', () => {
    const [b] = backdropsIn('<div className="modal-backdrop" {...closesOnPress(() => { a(); })} onClick={() => b()}>');
    expect(wrong([b]).rawPress).toHaveLength(1);
  });

  it('finds a backdrop whose class is not first or that is not a div, and one with no way to close', () => {
    const found = backdropsIn('<section className={`veil modal-backdrop${x ? " y" : ""}`} onMouseDown={f}><div className="modal-backdrop">');
    expect(found).toHaveLength(2);
    expect(wrong(found).rawPress).toHaveLength(1);
    expect(wrong(found).noClose).toHaveLength(2);
  });

  it('allows the walkthrough only in its own file', () => {
    const tag = '<div className="modal-backdrop compose-backdrop in-walk">';
    expect(wrong(backdropsIn(tag, 'components/ImportAgents.tsx')).noClose).toEqual([]);
    expect(wrong(backdropsIn(tag, 'components/Other.tsx')).noClose).toHaveLength(1);
  });

  it('does not take a selector or a longer class name for a backdrop', () => {
    expect(backdropsIn(`document.querySelector('.modal-backdrop'); <div className="modal-backdrop-x"> <i className="no-modal-backdrop">`)).toEqual([]);
  });
});

describe('every backdrop over the app', () => {
  const backdrops = walk(root).flatMap((file) => backdropsIn(readFileSync(file, 'utf8'), file.slice(root.length)));
  const found = wrong(backdrops);

  it('closes on the press, not on the click', () => {
    expect(backdrops.length).toBeGreaterThan(1);
    expect(found.rawPress).toEqual([]);
    expect(found.noClose).toEqual([]);
  });

  it('leaves alone the one box nothing outside it may close', () => {
    expect(found.walks.filter((b) => b.file === 'components/ImportAgents.tsx')).toHaveLength(1);
    expect(found.walks).toHaveLength(1);
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
