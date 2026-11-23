// A PICTURE OPENED FROM THE NEW THREAD BOX OPENS OVER IT (w-f745ce6612, 2026-11-23).
//
// "If I try to click on an image to expand it while I'm making a new thread,
// the image ends up behind the thread and it's a little bit buggy." The box's
// veil goes to z-index 9480 whenever a picture view is on the page, so that N
// opens the box over a picture opened big. That held for the picture the box
// itself opened too: the picture drew at 9400 under the box, a click anywhere
// on it landed on the veil and closed the box, and Escape closed the picture
// and sent the caret to the thread's reply box behind it. Measured in Chromium
// with the app's own styles: the point at the window's corner was the veil.
//
// Must still hold: N over a picture opened from a thread puts the box on top
// (n-starts-a-thread-over-a-file-opened-big), and the ⌘F box (9500) stays over
// everything.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const executablePath = fs.existsSync('/opt/agentbox/chromium.sh') ? '/opt/agentbox/chromium.sh' : chromium?.executablePath();
const browserAvailable = chromium && executablePath && fs.existsSync(executablePath);
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let browser;
const page = async () => {
  const bundle = (await build({
    stdin: { contents: `
      import React, { useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { AttachRow } from './renderer/src/components/AttachRow';
      import { closesOnPress } from './renderer/src/press';
      window.zero = new Proxy({}, { get: (_, k) => (typeof k === 'string' && k.startsWith('on') ? () => () => {} : () => Promise.resolve(null)) });
      window.boxClosed = 0;
      function Box() {
        const [open, setOpen] = useState(true);
        if (!open) return null;
        return (
          <>
            <textarea className="dock-input" aria-label="Reply" />
            <div className="modal-backdrop tc-veil" {...closesOnPress(() => { window.boxClosed += 1; setOpen(false); })}>
              <div className="tc-card" style={{ width: 400, padding: 20 }}>
                <textarea aria-label="New thread" defaultValue="draft" />
                <AttachRow attachments={[{ name: 'shot.png', image: true, dataBase64: ${JSON.stringify(PNG)} }]} onRemove={() => {}} />
              </div>
            </div>
          </>
        );
      }
      createRoot(document.getElementById('root')).render(<Box />);`,
    resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', logLevel: 'error',
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'empty', '.mp3': 'empty' },
  })).outputFiles[0].text;
  const p = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  p.setDefaultTimeout(5_000);
  await p.route('http://view.test/**', (r) => r.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
  await p.goto('http://view.test/');
  await p.addStyleTag({ content: read('renderer/src/styles.css') });
  await p.addStyleTag({ content: read('renderer/src/threads/thread-composer.css') });
  await p.addScriptTag({ content: bundle });
  await p.locator('.attach-open').click();
  await p.locator('.picture-view').waitFor();
  return p;
};
const onTop = (p, x, y) => p.evaluate(([x, y]) => {
  const el = document.elementFromPoint(x, y);
  return el?.closest('.picture-view') ? 'picture' : el?.closest('.tc-veil') ? 'box' : el?.tagName ?? null;
}, [x, y]);

describe.skipIf(!browserAvailable)('a picture opened from the new thread box', () => {
  beforeAll(async () => { browser = await chromium.launch({ headless: true, executablePath }); }, 60_000);
  afterAll(async () => { await browser?.close(); });

  it('is drawn over the box, at the middle and at the corner', async () => {
    const p = await page();
    expect(await onTop(p, 700, 450)).toBe('picture');
    expect(await onTop(p, 20, 880)).toBe('picture');
    await p.close();
  }, 30_000);

  it('closing it with a click beside the picture leaves the box open', async () => {
    const p = await page();
    await p.mouse.click(20, 880);
    await p.locator('.picture-view').waitFor({ state: 'detached' });
    expect(await p.evaluate(() => window.boxClosed)).toBe(0);
    expect(await p.locator('.tc-veil textarea').inputValue()).toBe('draft');
    await p.close();
  }, 30_000);

  it('Escape closes the picture, not the box, and the caret goes back into the box', async () => {
    const p = await page();
    await p.keyboard.press('Escape');
    await p.locator('.picture-view').waitFor({ state: 'detached' });
    expect(await p.evaluate(() => window.boxClosed)).toBe(0);
    await p.waitForFunction(() => document.activeElement?.closest('.tc-veil'));
    await p.keyboard.type('!');
    expect(await p.locator('.tc-veil textarea').inputValue()).toBe('draft!');
    expect(await p.locator('.dock-input').inputValue()).toBe('');
    await p.close();
  }, 30_000);
});

describe('the layers', () => {
  const css = read('renderer/src/styles.css');
  const z = (sel) => Number(new RegExp(`${sel.replace(/[.()]/g, '\\$&')}\\s*\\{[^}]*z-index:\\s*(\\d+)`).exec(css)?.[1]);
  it('a picture a box opened sits over the box raised over a big view, and under the ⌘F box', () => {
    const over = z('.picture-view.pv-over-its-box');
    expect(over).toBeGreaterThan(9480);
    expect(over).toBeLessThan(9500);
  });
  it('a picture opened from a thread stays under the box N opens over it', () => {
    expect(z('.picture-view')).toBeLessThan(9480);
  });
});
