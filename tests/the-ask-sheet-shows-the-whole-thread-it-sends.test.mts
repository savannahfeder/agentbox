// THE ASK SHEET SHOWS THE WHOLE THREAD IT SENDS (2026-11-21).
//
// From the founder: asking a teammate about an agent's message, the sheet drew
// that one message as a quote and nothing else, so it read as sending only
// that message. The teammate gets the whole thread, as a task that opens it
// with the message quoted as where to look (main/team/index.mts askTeammate).
// The sheet now draws the thread by its name with the message quoted inside
// it, the one the founder picked of five drawn in the real renderer. They
// asked that only Help point at a message: a review or a hand-over is of the
// whole thread, so it shows none and sends none. Checked as markup and in
// Chromium with the app's own menu.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { GiveSheet } from '../renderer/src/threads/SharePanel.tsx';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && fs.existsSync(chromium.executablePath());

const NAME = 'The staging tunnel keeps dropping';
const QUIC = 'QUIC is blocked here; switching the tunnel to plain HTTP/2.';
const sheet = (o = {}) => renderToStaticMarkup(h(GiveSheet, { to: { id: 'u-tony', name: 'Tony Reyes' }, onGive() {}, onAsk() {}, threadName: NAME, step: QUIC, ...o }));
/** The thread's card, from its opening tag to the note box under it. */
const card = (html) => /<div class="sh-thread">([\s\S]*?)<textarea/.exec(html)?.[1] ?? '';

describe('the sheet', () => {
  it('names the thread it sends, with the message you pressed quoted inside it', () => {
    const html = sheet();
    expect(card(html)).toContain(NAME);
    expect(card(html)).toContain(`<blockquote class="sh-step">${QUIC}</blockquote>`);
    expect(html.split('class="sh-step"').length - 1).toBe(1);
  });
  it('names the thread alone when it was opened from the menu, with no message pressed', () => {
    const html = sheet({ step: null });
    expect(card(html)).toContain(NAME);
    expect(html).not.toContain('sh-step');
  });
  // The founder, on the drawings: "for help maybe it should be a particular line but the others maybe not".
  it('quotes no message on Review or Hand over, where the whole thread is what they look at', () => {
    for (const start of ['review', 'give']) {
      const html = sheet({ start });
      expect(card(html)).toContain(NAME);
      expect(html).not.toContain(QUIC);
    }
  });
});

describe('the wiring', () => {
  it("the thread page hands the menu the thread's name as its row shows it", () => {
    expect(fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8'))
      .toContain('thread={{ product: item.product, id: item.id, name: pageTitle(item) }}');
  });
});

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ThreadMenu } from './renderer/src/threads/ThreadMenu';
import { askAboutStep } from './renderer/src/team/AsksLine';
window.calls = [];
window.askAbout = (text) => flushSync(() => askAboutStep(text));
window.mountMenu = (name) => {
  const root = createRoot(document.getElementById('menu'));
  flushSync(() => root.render(<ThreadMenu thread={{ product: 'infra', id: 'w-1', name }} giveTo={[{ id: 'u-tony', name: 'Tony' }]} onFinish={() => {}} onGive={() => {}}
    onAsk={(to, kind, note, step) => window.calls.push([kind, step])} />));
};`;
let browser, bundle;
beforeAll(async () => {
  if (!browserAvailable) return;
  bundle = (await build({
    stdin: { contents: entry, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', logLevel: 'error',
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'empty', '.mp3': 'empty' },
  })).outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
}, 60_000);
afterAll(async () => { await browser?.close(); });

describe.skipIf(!browserAvailable)('Ask a teammate on a thread', () => {
  it('opens the sheet on the thread by its name, the message inside it', async () => {
    const p = await browser.newPage();
    p.setDefaultTimeout(4000);
    await p.route('http://p.test/**', (r) => r.fulfill({ contentType: 'text/html', body: '<div id="menu"></div>' }));
    await p.goto('http://p.test/');
    await p.addScriptTag({ content: bundle });
    await p.evaluate((n) => window.mountMenu(n), NAME);
    await p.evaluate((t) => window.askAbout(t), QUIC);
    await p.click('text=Tony');
    expect(await p.locator('.sh-thread .sh-thread-head').innerText()).toBe(NAME);
    expect(await p.locator('.sh-thread .sh-step').innerText()).toBe(QUIC);
    await p.click('text=Ask Tony to help');
    expect(await p.evaluate(() => window.calls.splice(0))).toEqual([['help', QUIC]]);
    await p.close();
  });
  it('sends a review of the thread with no message, as the sheet shows it', async () => {
    const p = await browser.newPage();
    p.setDefaultTimeout(4000);
    await p.route('http://p.test/**', (r) => r.fulfill({ contentType: 'text/html', body: '<div id="menu"></div>' }));
    await p.goto('http://p.test/');
    await p.addScriptTag({ content: bundle });
    await p.evaluate((n) => window.mountMenu(n), NAME);
    await p.evaluate((t) => window.askAbout(t), QUIC);
    await p.click('text=Tony');
    await p.click('[role="radio"]:has-text("Review")');
    expect(await p.locator('.sh-step').count()).toBe(0);
    await p.click('text=Ask Tony to review');
    expect(await p.evaluate(() => window.calls.splice(0))).toEqual([['review', null]]);
    await p.close();
  });
});
