// THE INBOX SHOWS ONE SELECTION WHILE THE KEYS WALK IT (w-0b4b9770e6).
//
// A tester walked Needs you with J, J, K and an arrow and read two rows as
// selected. Two of the causes are pinned here. Measured by driving a copy of
// the app with Playwright: with the pointer resting on the second row, J moved
// the keyboard's underline to the first row while CSS `:hover` kept a second,
// fainter underline on the row under the pointer. The keys had already handed
// the row back (App clears `hoveredId`), but `:hover` cannot be cleared.
// And after clicking a sidebar button, Enter opened the selected row and also
// pressed the still-focused button, which went back to the top of the Inbox,
// so Enter appeared to do nothing.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build, transform } from 'esbuild';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium.executablePath());

const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

let browser, bundle, focusedButtonJs;
beforeAll(async () => {
  if (!browserAvailable) return;
  focusedButtonJs = (await transform(read('renderer/src/focused-button.ts'), { loader: 'ts', format: 'iife', globalName: 'focusedButton' })).code;
  bundle = (await build({
    stdin: { contents: `
      import React, { useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { List } from './renderer/src/components/List';
      const row = (id, title) => ({ id, product: 'p', title, status: 'open', result: 'Done.', createdAt: 1, updatedAt: 1, labels: [], priority: 0 });
      const items = [row('a', 'Word counting function and test'), row('b', 'Reverse order of words')];
      const none = () => {};
      function Inbox() {
        const [hovered, setHovered] = useState(null);
        window.keysTakeTheListBack = () => setHovered(null);
        return <List items={items} view="inbox" selected={0} seen={new Set()} running={[]} multiSel={new Set()}
          hoveredId={hovered} onHover={setHovered}
          onSelect={none} onOpen={none} onToggle={none} onRange={none} />;
      }
      createRoot(document.getElementById('root')).render(<Inbox />);`,
    resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', logLevel: 'error',
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'empty', '.mp3': 'empty' },
  })).outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
}, 60_000);
afterAll(async () => { await browser?.close(); });

const underlined = (page) => page.evaluate(() => [...document.querySelectorAll('.row')].map((r) => {
  const c = getComputedStyle(r.querySelector('.subject')!).textDecorationColor;
  return c === 'rgba(0, 0, 0, 0)' ? null : r.getAttribute('data-item-id');
}).filter(Boolean));

describe.skipIf(!browserAvailable)('a pointer resting on a row', () => {
  it('underlines it until a key takes the list back, and then only the keyboard row is underlined', async () => {
    const page = await browser.newPage({ viewport: { width: 1200, height: 600 } });
    page.setDefaultTimeout(5_000);
    await page.route('http://list.test/**', (r) => r.fulfill({ contentType: 'text/html',
      body: `<html data-theme="dark"><style>${read('renderer/src/styles.css')}</style><div class="app" id="root"></div></html>` }));
    await page.goto('http://list.test/');
    await page.addScriptTag({ content: bundle });
    await page.locator('[data-item-id="b"] .subject').waitFor();
    await page.locator('[data-item-id="b"] .subject').hover();
    await page.mouse.move(300, (await page.locator('[data-item-id="b"]').boundingBox())!.y + 10);
    // Past the underline's 0.12s fade.
    await page.waitForTimeout(300);
    expect(await underlined(page)).toEqual(['a', 'b']);
    await page.evaluate(() => (window as unknown as { keysTakeTheListBack: () => void }).keysTakeTheListBack());
    await page.waitForTimeout(300);
    expect(await underlined(page)).toEqual(['a']);
    // Moving the pointer gives the row back to it.
    await page.mouse.move(310, (await page.locator('[data-item-id="b"]').boundingBox())!.y + 12);
    await page.waitForTimeout(300);
    expect(await underlined(page)).toEqual(['a', 'b']);
    await page.close();
  });
});

describe.skipIf(!browserAvailable)('a sidebar button pressed with the mouse', () => {
  // Chromium turns :focus-visible on for it at the next key, so without the
  // mark the button kept Enter and the row never opened.
  it('leaves Enter to the list after J, and a button reached with Tab keeps it', async () => {
    const page = await browser.newPage();
    await page.setContent('<button id=clicked data-clicked>Inbox</button><button id=tabbed>Files</button>');
    await page.addScriptTag({ content: focusedButtonJs });
    const owns = (id: string) => page.evaluate((id) => (window as unknown as { focusedButton: { enterIsTheButtons: (e: unknown) => boolean } })
      .focusedButton.enterIsTheButtons({ key: 'Enter', target: document.getElementById(id) }), id);
    await page.click('#clicked');
    await page.keyboard.press('j');
    expect(await page.evaluate(() => document.activeElement!.matches(':focus-visible'))).toBe(true);
    expect(await owns('clicked')).toBe(false);
    await page.keyboard.press('Tab');
    expect(await owns('tabbed')).toBe(true);
    await page.close();
  });
});

describe('the app', () => {
  const app = read('renderer/src/App.tsx');

  it('tracks the pointer row whether or not key hints are on, and only lets it own the keys when they are', () => {
    expect(app).toMatch(/onHover=\{setHoveredId\}/);
    expect(app).not.toMatch(/onHover=\{keyHints \? setHoveredId : undefined\}/);
    expect(app).toMatch(/const keyHover = keyHints \? hoveredId : null;/);
    const pointed = app.slice(app.indexOf('const pointed: WorkItem | undefined'), app.indexOf('const keyTab ='));
    expect(pointed).toMatch(/keyHover/);
    expect(pointed).not.toMatch(/hoveredId/);
  });

  it('takes Enter from a button the mouse left focused when Enter opens a row', () => {
    const enter = app.match(/case 'Enter': ([^\n]*)/)![1];
    expect(enter).toMatch(/e\.preventDefault\(\)/);
  });

  it('draws the hover underline from the pointer row the keys can clear, not from :hover', () => {
    const css = read('renderer/src/styles.css');
    expect(css).not.toMatch(/\.row:hover \.subject/);
    expect(css).toMatch(/\.row\.pointed \.subject \{ text-decoration-color: var\(--line-strong\)/);
  });
});
