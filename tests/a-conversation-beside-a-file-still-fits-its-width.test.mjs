// A CONVERSATION BESIDE AN OPEN FILE STILL FITS ITS WIDTH (w-603fcad8c7).
//
// Opening a file beside a thread leaves the conversation 400px. Measured on the
// built app at 1440x900 with a page open: the reply bar's chips broke onto two
// rows with Stop floating between them, a code block's lines ran off its right
// edge with no visible way to scroll, and a markdown table's first column was
// 334px in a 328px message, so its other columns were out of sight.
//
// Rendered here with the app's own styles, once at 400 and once at 900.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium.executablePath());

const css = ['styles.css', 'workspace-navigation.css', 'threads/thread-composer.css', 'components/table-view.css', 'narrow-conversation.css']
  .map((f) => readFileSync(new URL(`../renderer/src/${f}`, import.meta.url), 'utf8')).join('\n');
const body = [
  'Here is my pick:',
  '',
  '```',
  'Open source, built for Claude Code and Codex, and live today for everyone who asked.',
  '```',
  '',
  '| Line | Closer | Length |',
  '|---|---|---|',
  '| Humans and agents will never work apart again, said in full | Flowers optional | 46 |',
].join('\n');

// Every call answers "done, nothing here", except the thread's history, which is the message above.
const stand_in = `
  const said = { id: 'w-0123456789', ts: Date.now() - 60000, source: 'agent', patch: { note: ${JSON.stringify(body)} } };
  const call = () => Promise.resolve(Object.assign([], { ok: true }));
  const history = () => Promise.resolve({ ok: true, lines: [said] });
  window.zero = new Proxy({}, { get: (_, k) => (k === 'itemHistory' ? history : typeof k === 'string' && k.startsWith('on') ? () => () => {} : call) });`;

let browser, bundle;
beforeAll(async () => {
  if (!browserAvailable) return;
  bundle = (await build({
    stdin: { contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { Focus } from './renderer/src/components/Focus';
      const now = Date.now();
      const item = { product: 'site', id: 'w-0123456789', title: 'the launch post', body: ${JSON.stringify(body)}, status: 'claimed', kind: 'question', labels: [], priority: 5, createdAt: now - 60000, updatedAt: now - 60000 };
      createRoot(document.getElementById('root')).render(
        <Focus item={item} replyOpen stoppable live={{}} session={null} runningMode="auto" runningEngine="claude"
          engines={[{ id: 'claude', label: 'Claude Code' }]} items={[item]}
          onClose={() => {}} onReply={() => {}} onReplyClose={() => {}} onNotice={() => {}} onStop={() => {}} onReplySend={() => {}} />);`,
    resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', logLevel: 'error',
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'empty', '.mp3': 'empty' },
  })).outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
}, 60_000);
afterAll(async () => { await browser?.close(); });

async function measure(width) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  page.setDefaultTimeout(5_000);
  await page.route('http://fits.test/**', (r) => r.fulfill({ contentType: 'text/html',
    // Held at its width the way the app's pane is, rather than growing to fit a long line.
    body: `<style>${css} #root > * { min-width: 0; }</style><div id="root" style="width:${width}px;height:900px;display:flex;overflow:hidden"></div>` }));
  await page.goto('http://fits.test/');
  // Before the bundle: the app decides on load whether a bridge is there.
  await page.addScriptTag({ content: stand_in });
  await page.addScriptTag({ content: bundle });
  await page.locator('.dock-stop').waitFor();
  await page.locator('.tbl-inline .tbl-th').first().waitFor();
  const m = await page.evaluate(() => {
    const box = (e) => e.getBoundingClientRect();
    const bar = [...document.querySelectorAll('.dock-bar .tc-chip, .dock-bar .dock-clip, .dock-bar .dock-stop')].map(box);
    const pre = document.querySelector('.markdown pre');
    const table = box(document.querySelector('.tbl-inline'));
    const second = box(document.querySelectorAll('.tbl-inline .tbl-th')[1]);
    return {
      barRows: new Set(bar.map((r) => Math.round(r.top + r.height / 2))).size,
      barFits: bar.every((r) => r.right <= box(document.querySelector('.dock-card')).right),
      codeHidden: pre.scrollWidth - pre.clientWidth,
      secondColumnStartsInView: second.left < table.right - 40,
      stopWord: document.querySelector('.dock-stop').innerText.trim() === 'Stop',
      priorityWord: document.querySelector('.dock-bar .tc-chip').innerText.trim() !== '',
      priorityName: document.querySelector('.dock-bar .tc-chip').getAttribute('aria-label'),
    };
  });
  await page.close();
  return m;
}

describe.skipIf(!browserAvailable)('the conversation beside an open file, 400px wide', () => {
  let m;
  beforeAll(async () => { m = await measure(400); }, 30_000);
  it('keeps the reply bar on one row, inside the box', () => {
    expect(m.barRows).toBe(1);
    expect(m.barFits).toBe(true);
  });
  it('drops the words "Medium" and "Stop" but keeps their names', () => {
    expect(m.stopWord).toBe(false);
    expect(m.priorityWord).toBe(false);
    expect(m.priorityName).toMatch(/^Priority: /);
  });
  it('wraps a long code line instead of hiding it', () => {
    expect(m.codeHidden).toBeLessThanOrEqual(0);
  });
  it('shows the start of a table\'s second column', () => {
    expect(m.secondColumnStartsInView).toBe(true);
  });
});

describe.skipIf(!browserAvailable)('the same conversation with room, 900px wide', () => {
  let m;
  beforeAll(async () => { m = await measure(900); }, 30_000);
  it('keeps every word on the reply bar, on one row', () => {
    expect(m.stopWord).toBe(true);
    expect(m.priorityWord).toBe(true);
    expect(m.barRows).toBe(1);
  });
});
