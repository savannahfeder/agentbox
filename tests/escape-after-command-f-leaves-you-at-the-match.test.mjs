// ESCAPE AFTER ⌘F LEAVES YOU AT THE MATCH.
//
// w-467cc7a919: in a file opened full screen, ⌘F found the words and scrolled
// to them, and Escape threw the page back to where it was before the search.
// Escape closed the box and handed the keyboard back to the document with a
// plain focus(), and focusing an editable page scrolls to the caret, which was
// wherever she last clicked. Measured here on the real find box over the real
// doc editor in Chromium: clicked near the top, found a word 150 paragraphs
// down, pressed Escape, and the scroller went from the match back to 0.
//
// Escape now hands the keyboard back without scrolling, and puts the selection
// on the match the way a browser's find does, so the next key lands there too.
import { beforeAll, afterAll, beforeEach, it, expect } from 'vitest';
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
      import {createRoot} from 'react-dom/client';
      import {useEditor, EditorContent} from '@tiptap/react';
      import {buildExtensions} from './renderer/src/editor/extensions';
      import {FindBar} from './renderer/src/components/FindBar';
      let opener = null;
      window.zero = {onFind: (fn) => { opener = fn; return () => { opener = null; }; }};
      window.pressFind = () => opener({step: 0});
      const paras = Array.from({length: 200}, (_, i) =>
        '<p>' + (i === 150 ? 'Here is the needle she wanted.' : 'Line ' + i + ' of the long file.') + '</p>').join('');
      function Doc() {
        const editor = useEditor({extensions: buildExtensions(''), content: paras});
        return <EditorContent editor={editor}/>;
      }
      function Page() {
        return <>
          <div id="scroller" style={{height: '500px', overflow: 'auto'}}>
            <button id="top-button">A button at the top</button>
            <Doc/>
            <p>A haystack line under the file, outside the editor.</p>
          </div>
          <textarea aria-label="Reply"/>
          <div role="textbox" aria-label="Rich reply" contentEditable suppressContentEditableWarning>start</div>
          <FindBar/>
        </>;
      }
      createRoot(document.getElementById('root')).render(<Page/>);`,
      resolveDir: process.cwd(), loader: 'tsx',
    },
    bundle: true, write: false, format: 'iife', loader: { '.css': 'empty' }, jsx: 'automatic',
  })).outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => { await browser?.close(); });
beforeEach(async () => {
  if (!browserAvailable) return;
  await page?.close();
  page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  page.setDefaultTimeout(5_000);
  await page.route('http://find.test/**', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<style>.find-bar{position:fixed;top:10px;right:10px}</style><div id="root"></div>',
  }));
  await page.goto('http://find.test/');
  await page.addScriptTag({ content: bundle });
  await page.locator('.ProseMirror p').first().waitFor();
});

const scrollTop = () => page.locator('#scroller').evaluate((el) => el.scrollTop);
const selected = () => page.evaluate(() => String(window.getSelection()));

async function find(words, label) {
  await page.evaluate(() => window.pressFind());
  const box = page.getByRole('textbox', { name: 'Find on this screen' });
  await box.fill(words);
  await page.locator('.find-count', { hasText: label }).waitFor();
  return box;
}

it.skipIf(!browserAvailable)('stays at the match when the keyboard was in the document near the top', async () => {
  await page.locator('.ProseMirror p').nth(1).click();
  expect(await scrollTop()).toBe(0);
  const box = await find('needle', '1 of 1');
  const atMatch = await scrollTop();
  expect(atMatch).toBeGreaterThan(1000);
  await box.press('Escape');
  await page.waitForTimeout(100);
  expect(await page.locator('.find-bar').count()).toBe(0);
  expect(Math.abs((await scrollTop()) - atMatch)).toBeLessThan(2);
  // The keyboard is back in the document, on the found words.
  expect(await page.evaluate(() => !!document.activeElement?.closest('.ProseMirror'))).toBe(true);
  expect(await selected()).toBe('needle');
});

it.skipIf(!browserAvailable)('the next key after Escape lands at the match, not where she clicked before', async () => {
  await page.locator('.ProseMirror p').nth(1).click();
  const box = await find('needle', '1 of 1');
  await box.press('Escape');
  await page.waitForTimeout(100);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type('X');
  expect(await page.locator('.ProseMirror p').nth(150).innerText()).toBe('Here is the needleX she wanted.');
  expect(await page.locator('.ProseMirror p').nth(1).innerText()).toBe('Line 1 of the long file.');
});

it.skipIf(!browserAvailable)('stays at the match when the keyboard was on a button near the top', async () => {
  await page.locator('#top-button').focus();
  const box = await find('haystack', '1 of 1');
  const atMatch = await scrollTop();
  expect(atMatch).toBeGreaterThan(1000);
  await box.press('Escape');
  await page.waitForTimeout(100);
  expect(Math.abs((await scrollTop()) - atMatch)).toBeLessThan(2);
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('top-button');
});

it.skipIf(!browserAvailable)('with nothing found, Escape changes nothing: same place, same caret', async () => {
  await page.locator('.ProseMirror p').nth(1).click();
  const before = await page.evaluate(() => {
    const s = window.getSelection();
    return [s.anchorNode?.textContent, s.anchorOffset];
  });
  const box = await find('nowhere-in-this-file', 'No matches');
  await box.press('Escape');
  await page.waitForTimeout(100);
  expect(await scrollTop()).toBe(0);
  expect(await page.evaluate(() => {
    const s = window.getSelection();
    return [s.anchorNode?.textContent, s.anchorOffset];
  })).toEqual(before);
});

it.skipIf(!browserAvailable)('a half-written reply keeps the keyboard and its words after Escape', async () => {
  const reply = page.getByRole('textbox', { name: 'Reply', exact: true });
  await reply.click();
  await page.keyboard.type('ab');
  const box = await find('haystack', '1 of 1');
  await box.press('Escape');
  await page.waitForTimeout(100);
  await page.keyboard.type('c');
  expect(await reply.inputValue()).toBe('abc');
});

it.skipIf(!browserAvailable)('a half-written rich reply keeps the keyboard and its caret after Escape', async () => {
  const reply = page.getByRole('textbox', { name: 'Rich reply', exact: true });
  await reply.click();
  await page.keyboard.press('End');
  await page.keyboard.type('ab');
  const box = await find('haystack', '1 of 1');
  await box.press('Escape');
  await page.waitForTimeout(100);
  await page.keyboard.type('c');
  expect(await reply.innerText()).toBe('startabc');
});
