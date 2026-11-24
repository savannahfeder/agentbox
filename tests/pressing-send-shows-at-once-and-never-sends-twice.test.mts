// PRESSING SEND SHOWS AT ONCE, AND A SECOND PRESS NEVER SENDS THE COMMENTS TWICE.
//
// Reported: "when I try to hit Send or click the button, there's a delay and
// sometimes it doesn't even process at all ... it doesn't give me automatic
// feedback". Measured on main: Send all, Send 1 and ⌘↵ changed nothing on
// screen until the app answered, and the app holds that answer up to 1.5 s for
// a running agent to take the comments, then the bar waits for the next
// refresh (400 ms, then a whole refetch). A press in that time wrote a second
// `toagent`, which hands the same comments over again.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium.executablePath());

let browser, page, bundle;
// A one-second 16×16 grey film; a film keeps Send all on a bar under the stage.
const FILM = Buffer.from('GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAHiEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHYTbuMU6uEElTDZ1OsggEeTbuMU6uEHFO7a1OsggHM7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsirXsYMPQkBNgI1MYXZmNTkuMjcuMTAwV0GNTGF2ZjU5LjI3LjEwMESJiECPQAAAAAAAFlSua8GuAQAAAAAAADjXgQFzxYhMmvOHeQS/ApyBACK1nIN1bmSIgQCGhVZfVlA4g4EBI+ODhDuaygDgibCBELqBEJqBAhJUw2f9c3OgY8CAZ8iaRaOHRU5DT0RFUkSHjUxhdmY1OS4yNy4xMDBzc9djwItjxYhMmvOHeQS/AmfIoUWjh0VOQ09ERVJEh5RMYXZjNTkuMzcuMTAwIGxpYnZweGfIokWjiERVUkFUSU9ORIeUMDA6MDA6MDEuMDAwMDAwMDAwAAAfQ7Z1p+eBAKOigQAAgBACAJ0BKhAAEAAARwiFhYiZhIgCAgAMDWAA/sPgABxTu2uRu4+zgQC3iveBAfGCAaDwgQM=', 'base64');

const harness = (file, path, line) => `
  import React, { useState } from 'react';
  import { createRoot } from 'react-dom/client';
  import { ArtifactView } from './renderer/src/components/ArtifactView';
  import { setPictureLinks } from './renderer/src/picture';
  setPictureLinks(() => 'http://view.test/demo.webm');
  const call = () => Promise.resolve(Object.assign([], { ok: true }));
  window.zero = new Proxy({}, { get: (_, k) => (k === 'liveRoom' ? () => Promise.resolve(null) : typeof k === 'string' && k.startsWith('on') ? () => () => {} : call) });
  const lines = [{ id: 'l1', ts: 1, source: 'agent', patch: { note: ${JSON.stringify(line)} } }];
  const note = (id, text, more = {}) => ({ id, file: ${JSON.stringify(file)}, v: 1, place: { kind: 'whole' }, text, by: 'me', ts: 1, wait: true, ...more });
  const waiting = { notes: [note('n1', 'Make the header match the inbox.'), note('n2', 'Less padding.')], approvals: [], seen: {} };
  window.wrote = [];
  // The app's answer waits until the test lets it go, as a busy agent makes it wait.
  window.answer = { ok: true };
  let release = [];
  window.release = () => { const r = release; release = []; r.forEach((f) => f(window.answer)); };
  function Host() {
    const [marks, setMarks] = useState(waiting);
    window.land = () => setMarks({ ...waiting, notes: waiting.notes.map((n) => ({ ...n, toAgent: true, sent: true })) });
    return <ArtifactView product="p" thread="t" lines={lines} marks={marks} me="me" people={[]}
      open={{ path: ${JSON.stringify(path)}, at: 1 }} ownerOfRow="me" withAgent
      write={(m) => { window.wrote.push(m); return new Promise((r) => release.push(r)); }}
      onNewVersion={async () => null} onClose={() => {}}
      files={{ find: async (p) => p, readText: async () => '# Plan\\n\\nThe header.\\n' }} />;
  }
  createRoot(document.getElementById('root')).render(<Host />);`;

const bundleOf = async (contents) => (await build({
  stdin: { contents, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, format: 'iife', jsx: 'automatic', logLevel: 'error',
  loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'empty', '.mp3': 'empty' },
})).outputFiles[0].text;

beforeAll(async () => {
  if (!browserAvailable) return;
  bundle = {
    film: await bundleOf(harness('demo.webm', 'designs/w-1/demo.webm', 'Here: [demo.webm](designs/w-1/demo.webm)')),
    document: await bundleOf(harness('plan.md', 'designs/w-1/plan.md', 'Here: [plan.md](designs/w-1/plan.md)')),
  };
  browser = await chromium.launch({ headless: true });
}, 60_000);
afterAll(async () => { await browser?.close(); });

const open = async (kind) => {
  await page?.close();
  page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.setDefaultTimeout(5_000);
  await page.route('http://view.test/**', (r) => (r.request().url().includes('.webm')
    ? r.fulfill({ contentType: 'video/webm', headers: { 'access-control-allow-origin': '*' }, body: FILM })
    : r.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' })));
  await page.goto('http://view.test/');
  await page.addScriptTag({ content: bundle[kind] });
};
const wrote = () => page.evaluate(() => window.wrote.filter((m) => m.do === 'toagent'));

describe.skipIf(!browserAvailable)('Send all under a film', () => {
  beforeEach(async () => {
    await open('film');
    await page.locator('.av-unsent-bar').getByRole('button', { name: /Send all/ }).waitFor();
  });

  it('says it is sending the moment it is pressed, before the app answers', async () => {
    await page.locator('.av-unsent-bar').getByRole('button', { name: /Send all/ }).click();
    await expect.poll(() => page.locator('.av-unsent-bar').textContent()).toBe('Sending 2 comments to your agent');
    expect(await page.locator('.av-unsent-bar').getByRole('button').count()).toBe(0);
  });

  it('keeps the comments under Unsent until the app has them, then moves them to Sent before its marks arrive', async () => {
    await page.locator('.av-unsent-bar').getByRole('button', { name: /Send all/ }).click();
    await page.locator('.av-unsent-bar', { hasText: 'Sending' }).waitFor();
    expect(await page.locator('.sb-sec', { hasText: 'Unsent' }).count()).toBe(1);
    await page.evaluate(() => window.release());
    await expect.poll(() => page.locator('.sb-sec', { hasText: 'Unsent' }).count()).toBe(0);
  });

  it('a second press, or ⌘↵, while it sends hands nothing over twice', async () => {
    await page.locator('.av-unsent-bar').getByRole('button', { name: /Send all/ }).click();
    await page.locator('.av-unsent-bar', { hasText: 'Sending' }).waitFor();
    await page.keyboard.press('Meta+Enter');
    await page.keyboard.press('Control+Enter');
    expect(await wrote()).toEqual([{ do: 'toagent', on: ['n1', 'n2'] }]);
  });

  it('says Sent to your agent once the app answers, then goes once the comments are sent', async () => {
    await page.locator('.av-unsent-bar').getByRole('button', { name: /Send all/ }).click();
    await page.evaluate(() => window.release());
    await expect.poll(() => page.locator('.av-unsent-bar').textContent()).toBe('Sent to your agent');
    await page.evaluate(() => window.land());
    await expect.poll(() => page.locator('.av-unsent-bar').count(), { timeout: 5_000 }).toBe(0);
  });

  it('a failure puts the comments back with Send all and says why', async () => {
    await page.evaluate(() => { window.answer = { ok: false, error: 'The agent could not be reached.' }; });
    await page.locator('.av-unsent-bar').getByRole('button', { name: /Send all/ }).click();
    await page.evaluate(() => window.release());
    await page.locator('.av-unsent-bar').getByRole('button', { name: /Send all/ }).waitFor();
    expect(await page.locator('.av-unsent-bar').textContent()).toContain('2 comments not sent to your agent');
    expect(await page.locator('.av-trouble').textContent()).toBe('The agent could not be reached.');
  });
});

describe.skipIf(!browserAvailable)('Send all beside Approve on a document', () => {
  beforeEach(async () => {
    await open('document');
    await page.locator('.av-verdict').getByRole('button', { name: /Send all/ }).waitFor();
  });

  it('reads Sending… and cannot be pressed again while the app answers, then Sent', async () => {
    const row = page.locator('.av-verdict');
    await row.getByRole('button', { name: /Send all/ }).click();
    const button = row.locator('.av-unsent-send');
    await expect.poll(() => button.textContent()).toBe('Sending…');
    expect(await button.isDisabled()).toBe(true);
    await button.click({ force: true });
    expect(await wrote()).toHaveLength(1);
    await page.evaluate(() => window.release());
    await expect.poll(() => button.textContent()).toBe('Sent');
  });
});
