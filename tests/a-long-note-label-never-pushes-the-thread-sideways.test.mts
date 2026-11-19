// A LONG NOTE LABEL NEVER PUSHES THE THREAD SIDEWAYS (w-d143fcb40a).
//
// A comment on a file shows its place above the words: "Note on
// 2026-11-19-multiplayer-loom-script.md, v15, “the quoted words”". That label
// was held on one line, so with a file open beside the thread a long quote
// made the label wider than the conversation, and the whole thread scrolled
// sideways with every message cut off on the left. Measured here at 400px
// with the app's own styles: the conversation was wider than its box.
//
// A short label still drops under the name whole rather than breaking inside
// its box (e52768c4).
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

const FILE = 'designs/w-0a9a000e0c76/2026-11-19-multiplayer-loom-script-v15.md';
const LONG = 'What makes it powerful for teams is that the inbox is shared between your teammates and agents';
const note = (id: string, place: unknown, text: string, ago: number) => ({
  id: 'w-0123456789', ts: Date.now() - ago, source: 'founder',
  patch: { artifact: { do: 'note', id, file: FILE, place, text } },
});
const lines = [
  { id: 'w-0123456789', ts: Date.now() - 90000, source: 'agent', patch: { note: 'Here is the script.' } },
  note('n1', { kind: 'quote', text: LONG }, 'This is the line I like most.', 60000),
  note('n2', { kind: 'whole' }, 'Short one.', 30000),
];

const stand_in = `
  const call = () => Promise.resolve(Object.assign([], { ok: true }));
  const history = () => Promise.resolve({ ok: true, lines: ${JSON.stringify(lines)} });
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
      const item = { product: 'site', id: 'w-0123456789', title: 'Getting teams onto multiplayer', body: 'Write the script.', status: 'claimed', kind: 'question', labels: [], priority: 5, createdAt: now - 120000, updatedAt: now - 30000 };
      createRoot(document.getElementById('root')).render(
        <Focus item={item} replyOpen live={{}} session={null} runningMode="auto" runningEngine="claude"
          engines={[{ id: 'claude', label: 'Claude Code' }]} items={[item]}
          onClose={() => {}} onReply={() => {}} onReplyClose={() => {}} onNotice={() => {}} onStop={() => {}} onReplySend={() => {}} />);`,
    resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', logLevel: 'error',
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'empty', '.mp3': 'empty' },
  })).outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
}, 60_000);
afterAll(async () => { await browser?.close(); });

async function measure(width: number) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  page.setDefaultTimeout(5_000);
  await page.route('http://fits.test/**', (r) => r.fulfill({ contentType: 'text/html',
    body: `<style>${css} #root > * { min-width: 0; }</style><div id="root" style="width:${width}px;height:900px;display:flex;overflow:hidden"></div>` }));
  await page.goto('http://fits.test/');
  await page.addScriptTag({ content: stand_in });
  await page.addScriptTag({ content: bundle });
  await page.locator('.msg-kind').nth(1).waitFor();
  const m = await page.evaluate((quoted) => {
    const scroll = document.querySelector('.focus-scroll')!;
    const kinds = [...document.querySelectorAll('.msg-head > .msg-kind')] as HTMLElement[];
    const short = kinds.find((k) => !k.textContent!.includes('“'))!;
    const long = kinds.find((k) => k.textContent!.includes('“'))!;
    return {
      sideways: scroll.scrollWidth - scroll.clientWidth,
      longFits: long.getBoundingClientRect().right <= scroll.getBoundingClientRect().right,
      longWhole: long.textContent!.includes(quoted),
      // One 11px line plus its border and padding is about 19px.
      shortOneLine: short.getBoundingClientRect().height < 24,
    };
  }, LONG);
  await page.close();
  return m;
}

describe.skipIf(!browserAvailable)('a note with a long quote beside an open file, 400px wide', () => {
  let m;
  beforeAll(async () => { m = await measure(400); }, 30_000);
  it('does not make the conversation scroll sideways', () => {
    expect(m.sideways).toBeLessThanOrEqual(0);
  });
  it('keeps the whole label inside the column, every word of it', () => {
    expect(m.longFits).toBe(true);
    expect(m.longWhole).toBe(true);
  });
  it('still keeps a short label on one line', () => {
    expect(m.shortOneLine).toBe(true);
  });
});

describe.skipIf(!browserAvailable)('the same thread with room, 900px wide', () => {
  let m;
  beforeAll(async () => { m = await measure(900); }, 30_000);
  it('does not scroll sideways either', () => {
    expect(m.sideways).toBeLessThanOrEqual(0);
  });
  it('keeps a short label on one line', () => {
    expect(m.shortOneLine).toBe(true);
  });
});
