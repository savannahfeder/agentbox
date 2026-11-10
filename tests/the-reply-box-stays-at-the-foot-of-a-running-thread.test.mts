// THE REPLY BOX STAYS AT THE FOOT OF A RUNNING THREAD (w-aa5994f2f5).
//
// What broke: on in-progress threads the reply box kept floating up into the
// middle of the window with empty space under it. Measured in the fixtures
// build: the working line's hidden status label (`.live-announcement`) is
// `position: absolute` with no positioned ancestor inside `.focus-scroll`, so
// the scroller did not clip it and it sat at its unscrolled place in the
// thread, 4,493px down a long one. That made the opened thread's frame
// (`.list-pane.pinned`, overflow hidden) 4,398px tall in a 942px window, and
// anything that scrolls ancestors into view, a search match centred with
// `scrollIntoView` among them, slid the whole frame up 292px, reply box and
// all. Only a thread with an agent working draws the label, which is why only
// in-progress threads did it.
//
// Rendered here with the app's own styles in a real browser.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium.executablePath());

const css = ['styles.css', 'workspace-navigation.css', 'narrow-conversation.css', 'threads/summary.css']
  .map((f) => readFileSync(new URL(`../renderer/src/${f}`, import.meta.url), 'utf8')).join('\n');
// Long enough that the conversation scrolls several windows' worth.
const note = Array.from({ length: 60 }, (_, i) => `Paragraph ${i + 1}: the new take is chosen and timed word by word.`).join('\n\n');

const stand_in = `
  const said = { id: 'w-0123456789', ts: Date.now() - 60000, source: 'agent', patch: { note: ${JSON.stringify(note)} } };
  const call = () => Promise.resolve(Object.assign([], { ok: true }));
  const history = () => Promise.resolve({ ok: true, lines: [said] });
  window.zero = new Proxy({}, { get: (_, k) => (k === 'itemHistory' ? history : typeof k === 'string' && k.startsWith('on') ? () => () => {} : call) });`;

const bundleFor = (running) => build({
  stdin: { contents: `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { Focus } from './renderer/src/components/Focus';
    const now = Date.now();
    const item = { product: 'site', id: 'w-0123456789', title: 'the launch film', body: 'Cut the launch film.', status: 'claimed', kind: 'task', labels: [], priority: 5, createdAt: now - 3600000, updatedAt: now - 60000 };
    const session = ${running} ? { itemId: item.id, product: item.product, startedAt: now - 2400000, activity: [], where: 'cloud' } : null;
    createRoot(document.getElementById('root')).render(
      <Focus item={item} live={{}} session={session} runningMode="auto" runningEngine="claude"
        engines={[{ id: 'claude', label: 'Claude Code' }]} items={[item]}
        onClose={() => {}} onReply={() => {}} onReplyClose={() => {}} onNotice={() => {}} onStop={() => {}} onReplySend={() => {}} />);`,
  resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, format: 'iife', jsx: 'automatic', logLevel: 'error',
  loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'empty', '.mp3': 'empty' },
}).then((r) => r.outputFiles[0].text);

let browser;
const bundles = {};
beforeAll(async () => {
  if (!browserAvailable) return;
  [bundles.running, bundles.idle] = await Promise.all([bundleFor(true), bundleFor(false)]);
  browser = await chromium.launch({ headless: true });
}, 60_000);
afterAll(async () => { await browser?.close(); });

// The frame an opened thread sits in, as App.tsx draws it: `main.list-pane.pinned`.
async function open(which) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.setDefaultTimeout(5_000);
  await page.route('http://foot.test/**', (r) => r.fulfill({ contentType: 'text/html',
    body: `<style>${css}</style><main id="root" class="list-pane pinned" style="height:900px"></main>` }));
  await page.goto('http://foot.test/');
  await page.addScriptTag({ content: stand_in });
  await page.addScriptTag({ content: bundles[which] });
  await page.locator('.focus p', { hasText: 'Paragraph 60' }).waitFor();
  if (which === 'running') await page.locator('.live-announcement').waitFor({ state: 'attached' });
  // Resting at the end of the conversation, where a thread opens.
  await page.evaluate(() => { const s = document.querySelector('.focus-scroll'); s.scrollTop = s.scrollHeight; });
  return page;
}

// Where the box is against the frame's foot, and whether the frame has moved.
const where = (page) => page.evaluate(() => {
  const frame = document.getElementById('root');
  const pane = document.querySelector('.focus-pane').getBoundingClientRect();
  const dock = document.querySelector('.focus-dock').getBoundingClientRect();
  return { frameTop: frame.scrollTop, gapUnderBox: Math.round(pane.bottom - dock.bottom), paneBottom: Math.round(pane.bottom), frameBottom: Math.round(frame.getBoundingClientRect().bottom) };
});

// What a search match does to the line it found (FindBar.tsx, reveal-line.ts).
const centre = (page, text) => page.evaluate((t) => [...document.querySelectorAll('.focus p')].find((p) => p.textContent.includes(t)).scrollIntoView({ block: 'center' }), text);
// The last thing in the thread: the working line when there is one.
const centreLast = (page) => page.evaluate(() => [...document.querySelectorAll('.focus p, .live-brief')].pop().scrollIntoView({ block: 'center' }));

describe.skipIf(!browserAvailable)('a long thread with an agent working', () => {
  let page;
  beforeAll(async () => { page = await open('running'); }, 30_000);
  afterAll(async () => { await page?.close(); });

  it('keeps the working line\'s hidden label inside the working line', async () => {
    const inside = await page.evaluate(() => {
      const label = document.querySelector('.live-announcement').getBoundingClientRect();
      const line = document.querySelector('.live-activity').getBoundingClientRect();
      return label.top >= line.top - 1 && label.bottom <= line.bottom + 1;
    });
    expect(inside).toBe(true);
  });

  it('keeps the reply box on the foot when the last line is centred', async () => {
    await centreLast(page);
    const at = await where(page);
    expect(at.frameTop).toBe(0);
    expect(at.paneBottom).toBe(at.frameBottom);
    expect(at.gapUnderBox).toBe(0);
  });
});

describe.skipIf(!browserAvailable)('the same thread with nobody working on it', () => {
  it('keeps the reply box on the foot too', async () => {
    const page = await open('idle');
    await centreLast(page);
    const at = await where(page);
    await page.close();
    expect(at.frameTop).toBe(0);
    expect(at.gapUnderBox).toBe(0);
  });
});

describe.skipIf(!browserAvailable)('the conversation itself', () => {
  it('still scrolls to a line that is asked for', async () => {
    const page = await open('running');
    const before = await page.evaluate(() => document.querySelector('.focus-scroll').scrollTop);
    await centre(page, 'Paragraph 1:');
    const after = await page.evaluate(() => document.querySelector('.focus-scroll').scrollTop);
    const at = await where(page);
    await page.close();
    expect(after).toBeLessThan(before);
    expect(at.gapUnderBox).toBe(0);
  });
});
