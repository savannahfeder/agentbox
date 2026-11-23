// Reported with a screenshot: "Our component here is blocking the visibility of
// the images, this little send component." Measured in the big viewer in
// Chromium at 1400×900: the "1 comment not sent to your agent · Send all" bar
// sat 72px up from the stage's foot, on top of the lower part of the picture.
//
// A picture now does what a document does: Send all sits beside Approve at the
// top of the notes column, and nothing floats over the picture. A film keeps its
// bar under the stage.
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
  it('beside the notes on a picture', () => expect(sendAllBesideTheNotes('image')).toBe(true));
  it('still under the stage on a film', () => expect(sendAllBesideTheNotes('film')).toBe(false));
});

// A 1×1 PNG.
const PICTURE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
let browser, page, bundle;

beforeAll(async () => {
  if (!browserAvailable) return;
  bundle = (await build({
    stdin: { contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { ArtifactView } from './renderer/src/components/ArtifactView';
      import { setPictureLinks } from './renderer/src/picture';
      setPictureLinks(() => 'http://view.test/picture.png');
      const call = () => Promise.resolve(Object.assign([], { ok: true }));
      window.zero = new Proxy({}, { get: (_, k) => (k === 'liveRoom' ? () => Promise.resolve(null) : typeof k === 'string' && k.startsWith('on') ? () => () => {} : call) });
      const lines = [{ id: 'l1', ts: 1, source: 'agent', patch: { note: 'Here: [step-1.png](designs/w-1/step-1.png)' } }];
      const note = (id, text) => ({ id, file: 'step-1.png', v: 1, place: { kind: 'whole' }, text, by: 'me', ts: 1, wait: true });
      const marks = { notes: [note('n1', 'Make the header match the inbox.'), note('n2', 'Less padding.')], approvals: [], seen: {} };
      window.wrote = [];
      createRoot(document.getElementById('root')).render(
        <ArtifactView product="p" thread="t" lines={lines} marks={marks} me="me" people={[]}
          open={{ path: 'designs/w-1/step-1.png', at: 1 }} ownerOfRow="me" withAgent
          write={async (m) => { window.wrote.push(m); return { ok: true }; }}
          onNewVersion={async () => null} onClose={() => {}}
          files={{ find: async (p) => p, readText: async () => '' }} />);`,
    resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', logLevel: 'error',
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'empty', '.mp3': 'empty' },
  })).outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
}, 60_000);
afterAll(async () => { await browser?.close(); });

describe.skipIf(!browserAvailable)('on a picture with two notes not sent', () => {
  beforeEach(async () => {
    await page?.close();
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.setDefaultTimeout(5_000);
    await page.route('http://view.test/**', (r) => (r.request().url().endsWith('.png')
      ? r.fulfill({ contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: PICTURE })
      : r.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' })));
    await page.goto('http://view.test/');
    await page.addScriptTag({ content: bundle });
    await page.locator('.av-picture img').waitFor();
  });

  it('Send all is beside Approve', async () => {
    const row = page.locator('.av-verdict');
    await expect.poll(() => row.getByRole('button', { name: /Send all/ }).count()).toBe(1);
    expect(await row.getByRole('button', { name: /Approve/ }).count()).toBe(1);
  });

  it('nothing floats over the picture, and the Unsent heading has no second Send', async () => {
    await page.locator('.av-verdict').getByRole('button', { name: /Send all/ }).waitFor();
    expect(await page.locator('.av-unsent-bar').count()).toBe(0);
    expect(await page.locator('.sb-send').count()).toBe(0);
  });

  it('pressing it hands both notes to the agent at once', async () => {
    await page.locator('.av-verdict').getByRole('button', { name: /Send all/ }).click();
    await expect.poll(() => page.evaluate(() => window.wrote)).toEqual([{ do: 'toagent', on: ['n1', 'n2'] }]);
  });
});
