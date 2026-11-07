// What broke (w-af3179c7ce, 2026-10-28, the web app on an iPhone): "the moment
// you hit the voice dictation button, the input field is not selected", and
// with agents asking for approval, "anytime I approved them, it stopped adding
// content to the input field. Even after I tapped the input field and kept
// talking". Measured on the whole app at an iPhone's size with a stand-in for
// Safari's recogniser (helpers/safari-speech.mjs): the microphone put the
// keyboard away and left the box unselected, and tapping Allow on an agent's
// card counted as a tap away from an empty reply box, which folded the box and
// ended the dictation with nothing on the screen to say so. Tapping the folded
// box opened a new one that was not listening.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { SAFARI_SPEECH } from './helpers/safari-speech.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium.executablePath());

const SITE = 'http://agentbox.test';
let browser;
let files;

beforeAll(async () => {
  if (!browserAvailable) return;
  // The app as the web app serves it, on a paid plan (cloud-bridge.ts sets it from the computer's settings copy).
  const out = await build({
    stdin: { contents: "import { setDictationAllowed } from './renderer/src/web-speech'; import './renderer/src/main'; setDictationAllowed(true);", resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, write: false, format: 'esm', outdir: 'out', jsx: 'automatic', logLevel: 'error',
    loader: { '.woff2': 'empty', '.woff': 'empty', '.ttf': 'empty', '.png': 'empty', '.webp': 'empty', '.jpg': 'empty', '.svg': 'text' },
    // Vite's own; nothing here needs the pictures it lists.
    banner: { js: 'globalThis.__noGlob = () => ({});' },
    define: { 'import.meta.glob': 'globalThis.__noGlob' },
  });
  files = Object.fromEntries(out.outputFiles.map((f) => [f.path.endsWith('.css') ? 'css' : 'js', f.text]));
  browser = await chromium.launch({ headless: true });
}, 120_000);

afterAll(async () => { await browser?.close(); });

async function phone(query = '') {
  const page = await browser.newPage({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true, colorScheme: 'dark' });
  await page.addInitScript(SAFARI_SPEECH);
  await page.route(`${SITE}/**`, (route) => {
    const url = route.request().url();
    if (url.endsWith('/app.js')) return route.fulfill({ contentType: 'text/javascript', body: files.js });
    if (url.endsWith('/app.css')) return route.fulfill({ contentType: 'text/css', body: files.css ?? '' });
    return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="en" data-door="phone" data-via="cloud"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>' });
  });
  await page.goto(`${SITE}/?fixtures=1${query}`);
  await page.getByText('Review: welcome-email sequence rewrite').first().waitFor();
  return page;
}

async function openReply(page) {
  await page.getByText('Review: welcome-email sequence rewrite').first().tap();
  await page.locator('.dock-pill').first().tap();
  await page.locator('.dictate-mic').waitFor();
}

const seen = (page, selector) => page.evaluate((sel) => {
  const box = document.querySelector(sel);
  return {
    box: box?.value ?? null,
    selected: !!box && document.activeElement === box,
    caretAtEnd: !!box && box.selectionStart === box.value.length,
    listening: document.querySelector('.dictate-row .dictate-word')?.textContent ?? null,
  };
}, selector);
const listening = (page) => page.waitForFunction(() => document.querySelector('.dictate-row .dictate-word')?.textContent === 'Listening');

describe.skipIf(!browserAvailable)('dictation in the web app, on a phone', () => {
  it('the microphone selects the reply box, with the cursor after what is typed, and the words go in', async () => {
    const page = await phone();
    await openReply(page);
    await page.locator('.dock-input').fill('Please');
    await page.locator('.dock-input').evaluate((b) => { b.blur(); b.setSelectionRange(0, 0); });
    await page.locator('.dictate-mic').tap();
    expect(await seen(page, '.dock-input')).toMatchObject({ selected: true, caretAtEnd: true, listening: 'Starting' });
    await listening(page);
    await page.evaluate(() => window.__speech.say('make the button', { final: false }));
    expect((await seen(page, '.dock-input')).box).toBe('Please make the button');
    await page.evaluate(() => window.__speech.say('make the button bigger'));
    expect(await seen(page, '.dock-input')).toMatchObject({ box: 'Please make the button bigger', selected: true, listening: 'Listening' });
    // Tapping the box to look at a word carries on listening.
    await page.locator('.dock-input').tap();
    await page.evaluate(() => window.__speech.say('and orange'));
    expect(await seen(page, '.dock-input')).toMatchObject({ box: 'Please make the button bigger and orange', listening: 'Listening' });
    await page.close();
  }, 60_000);

  it('the microphone selects the New thread box too', async () => {
    const page = await phone();
    await page.getByRole('button', { name: 'New thread' }).first().tap();
    await page.locator('.dictate-mic').tap();
    expect(await seen(page, '.tc-text')).toMatchObject({ selected: true, listening: 'Starting' });
    await listening(page);
    await page.evaluate(() => window.__speech.say('build the pricing page'));
    expect((await seen(page, '.tc-text')).box).toBe('build the pricing page');
    await page.close();
  }, 60_000);

  it('tapping Allow on an agent\'s card does not fold a reply box that is listening, before or after the first words', async () => {
    for (const first of ['', 'first part']) {
      const page = await phone('&approvals');
      await openReply(page);
      await page.locator('.dictate-mic').tap();
      await listening(page);
      if (first) await page.evaluate((w) => window.__speech.say(w), first);
      await page.locator('.approval-allow').first().tap();
      await page.waitForTimeout(300);
      await page.evaluate(() => window.__speech.say('second part'));
      expect(await seen(page, '.dock-input'), first || 'empty box').toMatchObject({ box: first ? 'first part second part' : 'second part', listening: 'Listening' });
      await page.close();
    }
  }, 60_000);

  it('the case that must still fold: an empty reply box that is not listening', async () => {
    const page = await phone('&approvals');
    await openReply(page);
    await page.locator('.approval-allow').first().tap();
    await page.waitForTimeout(300);
    expect(await page.locator('.dock-input').count()).toBe(0);
    expect(await page.locator('.dock-pill').count()).toBe(1);
    await page.close();
  }, 60_000);

  it('leaving the thread turns the microphone off', async () => {
    const page = await phone();
    await openReply(page);
    await page.locator('.dictate-mic').tap();
    await listening(page);
    await page.goBack();
    await page.waitForFunction(() => !window.__speech.live && window.__speech.all.every((r) => r.state === 'inactive'));
    expect(await page.evaluate(() => window.__speech.all.at(-1).calls)).toContain('abort');
    await page.close();
  }, 60_000);
});
