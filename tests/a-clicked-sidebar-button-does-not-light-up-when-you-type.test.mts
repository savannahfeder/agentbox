// A CLICKED SIDEBAR BUTTON DOES NOT LIGHT UP WHEN YOU TYPE (w-85a69eac43).
//
// Sidebar buttons kept showing an orange ring "randomly", in the founder's
// screenshots and in users'. The ring is the buttons' keyboard focus outline.
// Chromium leaves it off when a mouse click focuses a button, then turns it on
// as soon as any key is pressed (J, K, an arrow, even Shift) while that button
// still holds focus. Measured in Playwright's Chromium: click a button,
// :focus-visible is false; press j, it is true. In an app run from shortcuts,
// that is nearly every click.
//
// Rendered here with the app's own styles: a clicked button stays unlit through
// keys, and a button reached with Tab still lights, so the ring keeps doing its
// job for the keyboard.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium.executablePath());

const css = ['styles.css', 'workspace-navigation.css']
  .map((f) => readFileSync(new URL(`../renderer/src/${f}`, import.meta.url), 'utf8')).join('\n');

let browser, bundle;
beforeAll(async () => {
  if (!browserAvailable) return;
  bundle = (await build({
    stdin: { contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { WorkspaceNavigation } from './renderer/src/components/WorkspaceNavigation';
      const none = () => {};
      createRoot(document.getElementById('root')).render(
        <WorkspaceNavigation view="inbox" collapsed={false} onView={none} onSearch={none} onCompose={none}
          onHome={none} onFiles={none} onFeedback={none} onSettings={none} />);`,
    resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', logLevel: 'error',
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'empty', '.mp3': 'empty' },
  })).outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
}, 60_000);
afterAll(async () => { await browser?.close(); });

async function sidebar() {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  page.setDefaultTimeout(5_000);
  await page.route('http://ring.test/**', (r) => r.fulfill({ contentType: 'text/html',
    body: `<html data-theme="dark"><style>${css}</style><div class="app workspace-layout" id="root"></div></html>` }));
  await page.goto('http://ring.test/');
  await page.addScriptTag({ content: bundle });
  await page.locator('[data-tab="inbox"]').waitFor();
  return page;
}
const ring = (page) => page.evaluate(() => {
  const b = document.activeElement as HTMLElement;
  return { on: b.getAttribute('aria-label'), outline: getComputedStyle(b).outlineStyle };
});

describe.skipIf(!browserAvailable)('a sidebar button pressed with the mouse', () => {
  it('stays unlit when a key is pressed afterwards', async () => {
    const page = await sidebar();
    await page.click('[data-tab="inbox"]');
    for (const key of ['j', 'k', 'ArrowDown', 'Shift', 'Escape']) {
      await page.keyboard.press(key);
      expect(await ring(page), key).toEqual({ on: 'Inbox', outline: 'none' });
    }
    await page.click('[data-tab="files"]');
    await page.keyboard.press('j');
    expect(await ring(page)).toEqual({ on: 'Files', outline: 'none' });
    await page.close();
  });

  it('still lights the button Tab moves to next', async () => {
    const page = await sidebar();
    await page.click('[data-tab="home"]');
    await page.keyboard.press('Tab');
    expect(await ring(page)).toEqual({ on: 'Inbox', outline: 'solid' });
    await page.close();
  });

  it('lights again when the keyboard comes back to a button clicked earlier', async () => {
    const page = await sidebar();
    await page.click('[data-tab="inbox"]');
    await page.keyboard.press('Shift+Tab');
    expect((await ring(page)).outline).toBe('solid');
    await page.keyboard.press('Tab');
    expect(await ring(page)).toEqual({ on: 'Inbox', outline: 'solid' });
    await page.close();
  });
});
