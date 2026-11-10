// After Escape closed the permission mode menu in the reply box, Ctrl+Enter
// sent nothing. Measured on the real thread page in Chromium: type a reply,
// click the mode word ("Auto"), Escape. The menu closed but focus stayed on the
// mode word, and the send key is the box's own, so the reply sat there.
// Picking a mode already put the caret back; Escape did not. The model menu
// beside it already did, through its own close.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium.executablePath());

let browser, page, bundle;
const TYPED = 'make it per user';

beforeAll(async () => {
  if (!browserAvailable) return;
  bundle = (await build({
    stdin: { contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { Focus } from './renderer/src/components/Focus';
      // Every call the page makes answers "done, nothing here".
      const call = () => Promise.resolve(Object.assign([], { ok: true }));
      window.zero = new Proxy({}, { get: (_, k) => (typeof k === 'string' && k.startsWith('on') ? () => () => {} : call) });
      window.sent = [];
      const now = Date.now();
      const item = { product: 'backend', id: 'w-0123456789', title: 'add a rate limiter', body: 'add a rate limiter', status: 'open', kind: 'directive', labels: ['founder'], priority: 5, createdAt: now - 60000, updatedAt: now - 60000, result: 'Done.' };
      createRoot(document.getElementById('root')).render(
        <Focus item={item} replyOpen live={{}} session={null} runningMode="auto" runningEngine="claude"
          engines={[{ id: 'claude', label: 'Claude Code' }]} items={[item]}
          onClose={() => {}} onReply={() => {}} onReplyClose={() => {}} onNotice={() => {}}
          onReplySend={(text) => { window.sent.push(text); }} />);`,
    resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', logLevel: 'error',
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'empty', '.mp3': 'empty' },
  })).outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
}, 60_000);
afterAll(async () => { await browser?.close(); });
beforeEach(async () => {
  if (!browserAvailable) return;
  await page?.close();
  page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  page.setDefaultTimeout(5_000);
  await page.route('http://reply.test/**', (r) => r.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
  await page.goto('http://reply.test/');
  await page.addScriptTag({ content: bundle });
  await page.locator('.dock-input').click();
  await page.keyboard.type(TYPED);
});

const box = () => page.locator('.dock-input');
// Its name is the mode it is on ("Auto"); the title says what it is for.
const modeWord = () => page.locator('button[title="What this message may do"]');
const modeMenu = () => page.getByRole('listbox', { name: 'What this message may do' });
const caret = () => page.evaluate(() => {
  const a = document.activeElement;
  return a?.classList.contains('dock-input') ? { inBox: true, at: a.selectionStart, end: a.value.length } : { inBox: false };
});
const sent = () => page.evaluate(() => window.sent);

describe.skipIf(!browserAvailable)('Escape on the mode menu', () => {
  it('puts the caret back at the end of what you typed, and Ctrl+Enter sends it', async () => {
    await modeWord().click();
    await expect.poll(() => modeMenu().count()).toBe(1);
    await page.keyboard.press('Escape');
    expect(await modeMenu().count()).toBe(0);
    expect(await caret()).toEqual({ inBox: true, at: TYPED.length, end: TYPED.length });
    await page.keyboard.press('Control+Enter');
    await expect.poll(sent).toEqual([TYPED]);
  });

  it('the next Escape is the box\'s own again: it lets go of the caret and keeps your words', async () => {
    await modeWord().click();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    expect((await caret()).inBox).toBe(false);
    expect(await box().inputValue()).toBe(TYPED);
    expect(await sent()).toEqual([]);
  });

  it('picking a mode still puts the caret back too', async () => {
    await modeWord().click();
    await modeMenu().getByRole('option', { name: 'Plan' }).click();
    expect((await caret()).inBox).toBe(true);
  });

  it('a click away closes it without pulling the caret back into the box', async () => {
    await modeWord().click();
    await page.mouse.click(1150, 20);
    expect(await modeMenu().count()).toBe(0);
    expect((await caret()).inBox).toBe(false);
  });
});

describe.skipIf(!browserAvailable)('Escape on the model menu, beside it', () => {
  it('already puts the caret back, and Ctrl+Enter sends', async () => {
    await page.locator('.model-pick button[data-trigger]').click();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    expect(await caret()).toEqual({ inBox: true, at: TYPED.length, end: TYPED.length });
    await page.keyboard.press('Control+Enter');
    await expect.poll(sent).toEqual([TYPED]);
  });
});
