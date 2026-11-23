// Asked for: "unlike videos i don't see a way to send all messages easily to
// the agent ... that should be somewhere on right side comment window so as to
// not interrupt". Measured in the real file view in Chromium: on a document the
// only Send all was a bar floating over the page, on top of the words being
// read, and the notes column had just "Send 2" for this version.
//
// The approved design puts "Send all ⌘↵" beside Approve at the top of the notes
// column, for every file but films and pictures, which keep the bar under the
// stage that was already liked there.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { sendAllBesideTheNotes } from '../renderer/src/artifact-pins.ts';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium.executablePath());

describe('where Send all sits', () => {
  it('beside the notes on a document, a table, code, a page, a PDF and slides', () => {
    for (const kind of ['markdown', 'table', 'code', 'page', 'pdf', 'deck']) expect(sendAllBesideTheNotes(kind)).toBe(true);
  });
  // A picture moved beside the notes too (send-all-sits-beside-approve-on-a-picture).
  it('under the stage on a film, as before', () => {
    expect(sendAllBesideTheNotes('film')).toBe(false);
  });
});

let browser, page, bundle;

beforeAll(async () => {
  if (!browserAvailable) return;
  bundle = (await build({
    stdin: { contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { ArtifactView } from './renderer/src/components/ArtifactView';
      const call = () => Promise.resolve(Object.assign([], { ok: true }));
      window.zero = new Proxy({}, { get: (_, k) => (k === 'liveRoom' ? () => Promise.resolve(null) : typeof k === 'string' && k.startsWith('on') ? () => () => {} : call) });
      const DOC = '# Answers\\n\\nCoding agents work on your computer.\\n\\nThe platforms kept banning our accounts.\\n';
      const lines = [{ id: 'l1', ts: 1, source: 'agent', patch: { note: 'Here: [answers.md](yc/answers.md)' } }];
      const note = (id, text, quote) => ({ id, file: 'answers.md', v: 1, place: { kind: 'quote', text: quote }, text, by: 'me', ts: 1, wait: true });
      const marks = { notes: [note('n1', 'More detail here.', 'Coding agents work'), note('n2', 'This is wrong.', 'The platforms kept')], approvals: [], seen: {} };
      window.wrote = [];
      createRoot(document.getElementById('root')).render(
        <ArtifactView product="p" thread="t" lines={lines} marks={marks} me="me" people={[]}
          open={{ path: 'yc/answers.md', at: 1 }} ownerOfRow="me" withAgent
          write={async (m) => { window.wrote.push(m); return { ok: true }; }}
          onNewVersion={async () => null} onClose={() => {}}
          files={{ find: async (p) => p, readText: async () => DOC }} />);`,
    resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', logLevel: 'error',
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'empty', '.mp3': 'empty' },
  })).outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
}, 60_000);
afterAll(async () => { await browser?.close(); });

describe.skipIf(!browserAvailable)('on a document with two notes not sent', () => {
  beforeEach(async () => {
    await page?.close();
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.setDefaultTimeout(5_000);
    await page.route('http://doc.test/**', (r) => r.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
    await page.goto('http://doc.test/');
    await page.addScriptTag({ content: bundle });
    await page.locator('.ProseMirror').waitFor();
  });

  it('Send all is beside Approve', async () => {
    const row = page.locator('.av-verdict');
    await expect.poll(() => row.getByRole('button', { name: /Send all/ }).count()).toBe(1);
    expect(await row.getByRole('button', { name: /Approve/ }).count()).toBe(1);
  });

  it('nothing floats over the page, and the Unsent heading has no second Send', async () => {
    await page.locator('.av-verdict').getByRole('button', { name: /Send all/ }).waitFor();
    expect(await page.locator('.av-unsent-bar').count()).toBe(0);
    expect(await page.locator('.sb-send').count()).toBe(0);
  });

  it('pressing it hands both notes to the agent at once', async () => {
    await page.locator('.av-verdict').getByRole('button', { name: /Send all/ }).click();
    await expect.poll(() => page.evaluate(() => window.wrote)).toEqual([{ do: 'toagent', on: ['n1', 'n2'] }]);
  });
});
