// CLOSING THE ASK SHEET KEEPS IT AS YOU LEFT IT (2026-11-21).
//
// From the founder, on a thread of their own: they pressed Ask a teammate on
// an agent's message, picked a teammate, started typing what they needed, and
// clicked away. The sheet closed, which they were fine with. Pressing Ask a
// teammate again started from the list of people, with the message they had
// typed gone. Every close ran one reset of whom, which mode and which
// message, and the note lived only inside the sheet, so it died with it.
// Reproduced in Chromium with the app's own menu: pick, type, click away, ask
// again, and the note box was empty behind the list of people.
//
// Now whatever you leave in the sheet is kept for that thread, as the reply
// box keeps its draft, until it is sent.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { readAskDraft, saveAskDraft } from '../renderer/src/drafts.ts';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium.executablePath());

const QUIC = 'QUIC is blocked here; switching the tunnel to plain HTTP/2.';
const PORT = 'Port 443 answers from the office. Should I keep the old tunnel up as a fallback?';

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ThreadMenu } from './renderer/src/threads/ThreadMenu';
import { askAboutStep } from './renderer/src/team/AsksLine';
window.calls = [];
window.askAbout = (text) => flushSync(() => askAboutStep(text));
let root = null;
window.mountMenu = (id = 'w-1', people = [{ id: 'u-tony', name: 'Tony Reyes' }, { id: 'u-maya', name: 'Maya Lin' }]) => {
  root?.unmount();
  root = createRoot(document.getElementById('menu'));
  flushSync(() => root.render(<ThreadMenu thread={{ product: 'api', id }} giveTo={people} onFinish={() => {}}
    onGive={(to, note) => window.calls.push(['give', to.id, note])}
    onAsk={(to, kind, note, step) => window.calls.push(['ask', to.id, kind, note, step])} />));
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

async function page() {
  const p = await browser.newPage();
  p.setDefaultTimeout(4000);
  // A real origin, for the draft store's localStorage.
  await p.route('http://p.test/**', (r) => r.fulfill({ contentType: 'text/html', body: '<div id="menu"></div><div id="away" style="position:fixed;right:0;bottom:0;width:60px;height:60px"></div>' }));
  await p.goto('http://p.test/');
  await p.addScriptTag({ content: bundle });
  await p.evaluate(() => window.mountMenu());
  return p;
}
const calls = (p) => p.evaluate(() => window.calls.splice(0));
const note = (p) => p.locator('textarea.sh-note');
const sheetOpen = async (p) => (await note(p).count()) === 1;
const picked = (p) => p.locator('[role="radio"][aria-checked="true"]').innerText();
const quote = (p) => p.locator('.sh-step').innerText();
const clickAway = (p) => p.click('#away');

/** Ask a teammate on a message, pick Tony, switch to a review and start typing. */
async function startAsking(p, step = QUIC) {
  await p.evaluate((t) => window.askAbout(t), step);
  await p.click('text=Tony Reyes');
  await p.click('[role="radio"]:has-text("Review")');
  await note(p).fill('Can you check the office firewall?');
}

describe.skipIf(!browserAvailable)('the ask sheet, closed before it was sent', () => {
  it('comes back on Ask a teammate as it was: Tony, Review, the message and the note', async () => {
    const p = await page();
    await startAsking(p);
    await clickAway(p);
    expect(await sheetOpen(p)).toBe(false);
    await p.evaluate((t) => window.askAbout(t), QUIC);
    expect(await sheetOpen(p)).toBe(true);
    expect(await note(p).inputValue()).toBe('Can you check the office firewall?');
    expect(await picked(p)).toBe('Review');
    expect(await quote(p)).toBe(QUIC);
    await p.click('text=Ask Tony to review');
    expect(await calls(p)).toEqual([['ask', 'u-tony', 'review', 'Can you check the office firewall?', QUIC]]);
    await p.close();
  });

  it('comes back the same from the menu’s Ask or hand off… row, message and all', async () => {
    const p = await page();
    await startAsking(p);
    await clickAway(p);
    await p.click('button[aria-label="More actions"]');
    await p.click('text=Ask or hand off…');
    expect(await note(p).inputValue()).toBe('Can you check the office firewall?');
    expect(await quote(p)).toBe(QUIC);
    await p.close();
  });

  it('comes back after Escape too, which closes it the same way', async () => {
    const p = await page();
    await startAsking(p);
    await note(p).press('Escape');
    expect(await sheetOpen(p)).toBe(false);
    await p.evaluate((t) => window.askAbout(t), QUIC);
    expect(await note(p).inputValue()).toBe('Can you check the office firewall?');
    await p.close();
  });

  it('comes back after leaving the thread and opening it again', async () => {
    const p = await page();
    await startAsking(p);
    await clickAway(p);
    await p.evaluate(() => window.mountMenu('w-2'));
    await p.evaluate(() => window.mountMenu('w-1'));
    await p.evaluate((t) => window.askAbout(t), QUIC);
    expect(await note(p).inputValue()).toBe('Can you check the office firewall?');
    await p.close();
  });

  it('asked about another message, points at that one and keeps the note', async () => {
    const p = await page();
    await startAsking(p);
    await clickAway(p);
    await p.evaluate((t) => window.askAbout(t), PORT);
    expect(await quote(p)).toBe(PORT);
    expect(await note(p).inputValue()).toBe('Can you check the office firewall?');
    await p.close();
  });

  it('lets you pick someone else by pressing the name, keeping the note', async () => {
    const p = await page();
    await startAsking(p);
    await p.click('.sh-to button:has-text("Tony")');
    expect(await sheetOpen(p)).toBe(false);
    await p.click('text=Maya Lin');
    expect(await note(p).inputValue()).toBe('Can you check the office firewall?');
    expect(await picked(p)).toBe('Review');
    await p.click('text=Ask Maya to review');
    expect((await calls(p))[0].slice(0, 3)).toEqual(['ask', 'u-maya', 'review']);
    await p.close();
  });

  it('opens on the list of people when the one it was for is no longer on it, note kept', async () => {
    const p = await page();
    await startAsking(p);
    await clickAway(p);
    await p.evaluate(() => window.mountMenu('w-1', [{ id: 'u-maya', name: 'Maya Lin' }]));
    await p.evaluate((t) => window.askAbout(t), QUIC);
    expect(await sheetOpen(p)).toBe(false);
    await p.click('text=Maya Lin');
    expect(await note(p).inputValue()).toBe('Can you check the office firewall?');
    await p.close();
  });
});

describe.skipIf(!browserAvailable)('what is not kept', () => {
  it('an ask once sent: the next one starts from the people, on Help, with an empty note', async () => {
    const p = await page();
    await startAsking(p);
    await p.click('text=Ask Tony to review');
    await p.evaluate((t) => window.askAbout(t), QUIC);
    expect(await sheetOpen(p)).toBe(false);
    await p.click('text=Tony Reyes');
    expect(await note(p).inputValue()).toBe('');
    expect(await picked(p)).toBe('Help');
    await p.close();
  });

  it('a thread once handed over', async () => {
    const p = await page();
    await startAsking(p);
    await p.click('[role="radio"]:has-text("Hand over")');
    await p.click('text=Give to Tony');
    expect(await calls(p)).toEqual([['give', 'u-tony', 'Can you check the office firewall?']]);
    await p.evaluate((t) => window.askAbout(t), QUIC);
    expect(await sheetOpen(p)).toBe(false);
    await p.close();
  });

  it('another thread: its sheet starts empty', async () => {
    const p = await page();
    await startAsking(p);
    await clickAway(p);
    await p.evaluate(() => window.mountMenu('w-2'));
    await p.evaluate((t) => window.askAbout(t), QUIC);
    expect(await sheetOpen(p)).toBe(false);
    await p.click('text=Tony Reyes');
    expect(await note(p).inputValue()).toBe('');
    await p.close();
  });
});

describe('the kept sheet in the store', () => {
  const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), m }; };
  const thread = { product: 'api', id: 'w-1' };
  it('reads back what was saved, and nothing once it is cleared', () => {
    const s = memory();
    saveAskDraft(thread, { to: { id: 'u-tony', name: 'Tony Reyes' }, mode: 'review', step: QUIC, note: 'Check the firewall' }, s);
    expect(readAskDraft(thread, s)).toEqual({ to: { id: 'u-tony', name: 'Tony Reyes' }, mode: 'review', step: QUIC, note: 'Check the firewall' });
    expect(readAskDraft({ product: 'api', id: 'w-2' }, s)).toBeNull();
    saveAskDraft(thread, null, s);
    expect(s.m.size).toBe(0);
  });
  it('reads a damaged entry as nothing rather than as half a sheet', () => {
    const s = memory();
    for (const bad of ['{', '"text"', JSON.stringify({ to: { id: 'u-tony' }, mode: 'help', note: '' }), JSON.stringify({ to: { id: 'u-tony', name: 'Tony' }, mode: 'shout', note: '' })]) {
      s.m.clear();
      s.m.set('zero.askdraft.api:w-1', bad);
      expect(readAskDraft(thread, s)).toBeNull();
    }
  });
});
