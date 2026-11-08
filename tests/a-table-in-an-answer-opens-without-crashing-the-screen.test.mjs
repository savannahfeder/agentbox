// A TABLE IN AN ANSWER OPENS WITHOUT CRASHING THE SCREEN.
//
// Opening a thread whose answer holds a table ("Biggest payment companies by
// volume" in the sample data) threw "Maximum update depth exceeded" from
// TableView, and the whole screen reloaded itself. The table kept its rows by
// setting state while it drew, and when the message around it redrew in the
// same paint (the thread page does on opening) that update never settled.
// Measured in Chromium on the real InlineTable: a parent that redraws from a
// layout effect, with fresh rows each time, crashed it; one that redraws later
// did not.
import { beforeAll, afterAll, it, expect } from 'vitest';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium.executablePath());
let browser, bundle;

beforeAll(async () => {
  if (!browserAvailable) return;
  bundle = (await build({
    stdin: { contents: `
      import React, {useState, useEffect, useLayoutEffect} from 'react';
      import {createRoot} from 'react-dom/client';
      import {InlineTable} from './renderer/src/components/TableView';
      const rows = (n) => [['Company', 'Volume'], ['Stripe', '1.4T'], ['Adyen', n > 2 ? '1.3T' : '1.2T']];
      const how = new URLSearchParams(location.search).get('redraw');
      function Page() {
        const [n, setN] = useState(0);
        useLayoutEffect(() => { if (how === 'same-paint' && n < 3) setN(n + 1); }, [n]);
        useEffect(() => { if (how === 'later' && n < 3) setN(n + 1); }, [n]);
        return <div><p id="count">{n}</p><InlineTable grid={rows(n)} /></div>;
      }
      createRoot(document.getElementById('root')).render(<Page/>);`,
      resolveDir: process.cwd(), loader: 'tsx',
    },
    bundle: true, write: false, format: 'iife', jsx: 'automatic',
    loader: { '.css': 'empty', '.svg': 'empty', '.png': 'empty' },
    define: { 'process.env.NODE_ENV': '"development"' },
  })).outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => { await browser?.close(); });

async function open(redraw) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('http://table.test/**', (route) => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
  await page.goto(`http://table.test/?redraw=${redraw}`);
  await page.addScriptTag({ content: bundle });
  await page.locator('#count', { hasText: redraw === 'none' ? '0' : '3' }).waitFor({ timeout: 3_000 }).catch(() => {});
  await page.waitForTimeout(200);
  const text = await page.locator('#root').innerText();
  await page.close();
  return { errors, text };
}

it.skipIf(!browserAvailable)('the message redrawing in the same paint as the table does not crash it', async () => {
  const { errors, text } = await open('same-paint');
  expect(errors).toEqual([]);
  // And the table shows the newest rows, not the ones it opened with.
  expect(text).toContain('1.3T');
});

it.skipIf(!browserAvailable)('a redraw after the paint still shows the newest rows', async () => {
  const { errors, text } = await open('later');
  expect(errors).toEqual([]);
  expect(text).toContain('1.3T');
});

it.skipIf(!browserAvailable)('a table nothing redraws shows its rows', async () => {
  const { errors, text } = await open('none');
  expect(errors).toEqual([]);
  expect(text).toContain('Stripe');
  expect(text).toContain('1.2T');
});
