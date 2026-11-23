// ⌘↵ SENDS A NOTE WITH THE NAME LIST OPEN, THE FIRST TIME.
//
// Reported on 2026-11-22: ⌘↵ on a note sometimes sent it and sometimes had to
// be pressed again. One way in, read off ArtifactView.tsx: a note ending in
// @ and a name (the box's own hint is "Add a note, or @ your agent") opens
// the name list, and the list took Enter with or without ⌘, so the first ⌘↵
// only finished the name and the second sent the note. The thread's reply box
// and its agent list already leave ⌘↵ to Send.
//
// Must still hold: Enter and Tab pick from the list, and ⌘↵ with no list
// open keeps the note and sends it.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && fs.existsSync(chromium.executablePath());

const D = '/Users/someone/store/designs/w-1';
const ledger = [{ id: 'l1', ts: Date.UTC(2026, 10, 21, 19, 0, 0), source: 'agent', patch: { result: `The plan:\n\n${D}/plan.md` } }];

let browser;
const page = async () => {
  const bundle = (await build({
    stdin: { contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { ArtifactView } from './renderer/src/components/ArtifactView';
      const call = () => Promise.resolve(Object.assign([], { ok: true }));
      window.zero = new Proxy({}, { get: (_, k) => (k === 'liveRoom' ? () => Promise.resolve(null) : typeof k === 'string' && k.startsWith('on') ? () => () => {} : call) });
      window.writes = [];
      createRoot(document.getElementById('root')).render(
        <ArtifactView product="p" thread="t" lines={${JSON.stringify(ledger)}} numbers={{}} marks={{ notes: [], approvals: [], seen: {} }} me="u-me" people={[]}
          open={{ path: ${JSON.stringify(`${D}/plan.md`)} }} ownerOfRow="u-me" withAgent onClose={() => {}}
          write={async (m) => { window.writes.push(m.do); return { ok: true }; }}
          files={{ find: async (f) => f, readText: async () => 'Ship the hero.' }} />);`,
    resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', logLevel: 'error',
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'empty', '.mp3': 'empty' },
  })).outputFiles[0].text;
  const p = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  p.setDefaultTimeout(5_000);
  await p.route('http://view.test/**', (r) => r.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
  await p.goto('http://view.test/');
  await p.addScriptTag({ content: bundle });
  await p.locator('.av-write-box textarea').waitFor();
  return p;
};
const box = (p) => p.locator('.av-write-box textarea');
const writes = (p) => p.evaluate(() => window.writes);

describe.skipIf(!browserAvailable)('the notes box on a file your agent made', () => {
  beforeAll(async () => { browser = await chromium.launch({ headless: true }); }, 60_000);
  afterAll(async () => { await browser?.close(); });

  it('⌘↵ with the name list open sends the note at once', async () => {
    const p = await page();
    await box(p).click();
    await p.keyboard.type('Tighter please @agent');
    await p.locator('.av-ask-list, [role="listbox"]').first().waitFor();
    await p.keyboard.press('ControlOrMeta+Enter');
    await expect.poll(() => writes(p)).toEqual(['note', 'toagent']);
    expect(await box(p).inputValue()).toBe('');
    await p.close();
  }, 30_000);

  it('Enter with the list open still picks the name and sends nothing', async () => {
    const p = await page();
    await box(p).click();
    await p.keyboard.type('Tighter please @ag');
    await p.locator('.av-ask-list, [role="listbox"]').first().waitFor();
    await p.keyboard.press('Enter');
    expect(await box(p).inputValue()).toBe('Tighter please @agent ');
    expect(await writes(p)).toEqual([]);
    await p.close();
  }, 30_000);

  it('⌘↵ with no list open keeps the note and sends it', async () => {
    const p = await page();
    await box(p).click();
    await p.keyboard.type('Tighter please');
    await p.keyboard.press('ControlOrMeta+Enter');
    await expect.poll(() => writes(p)).toEqual(['note', 'toagent']);
    await p.close();
  }, 30_000);
});
