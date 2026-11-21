// CLOSING THE ASK SHEET KEEPS IT AS YOU LEFT IT (2026-11-21).
//
// From the founder, on a thread of their own: they pressed Ask a teammate on
// an agent's message, picked a teammate, started typing what they needed, and
// clicked away. The sheet closed, which they were fine with. Pressing Ask a
// teammate again started from the list of people, with the message they had
// typed gone. Every close reset whom and which choice, and the note lived only
// in the open sheet.
//
// Main has since kept a sheet with words typed open on a click outside, and
// each person's note until it is sent, in memory. On top of that a close now
// leaves the sheet to open again: Ask a teammate opens the same person's sheet
// on the same choice, pointing at the message pressed, and every note outlives
// leaving the thread. Back to the people, or a send, ends it. Reproduced and
// checked in Chromium with the app's own menu.
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
const NOTE = 'Can you check the office firewall?';
const TONY = { id: 'u-tony', name: 'Tony Reyes' };
const MAYA = { id: 'u-maya', name: 'Maya Lin' };

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ThreadMenu } from './renderer/src/threads/ThreadMenu';
import { askAboutStep } from './renderer/src/team/AsksLine';
window.calls = [];
window.askAbout = (text) => flushSync(() => askAboutStep(text));
let root = null;
window.mountMenu = (id, people) => {
  root?.unmount();
  root = createRoot(document.getElementById('menu'));
  flushSync(() => root.render(<ThreadMenu thread={{ product: 'api', id, name: 'The staging tunnel keeps dropping' }} giveTo={people} onFinish={() => {}}
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
  await mount(p);
  return p;
}
const mount = (p, id = 'w-1', people = [TONY, MAYA]) => p.evaluate(([i, list]) => window.mountMenu(i, list), [id, people]);
const askAbout = (p, step = QUIC) => p.evaluate((t) => window.askAbout(t), step);
const calls = (p) => p.evaluate(() => window.calls.splice(0));
const note = (p) => p.locator('textarea.sh-note');
const sheetOpen = async (p) => (await note(p).count()) === 1;
/** The first name on the open sheet's To chip, after its face's letters. */
const sheetFor = async (p) => (await p.locator('.sh-to .sh-chip').innerText()).replace(/^[A-Z]{2}/, '');
const picked = (p) => p.locator('[role="radio"][aria-checked="true"]').innerText();
const quote = (p) => p.locator('.sh-step').innerText();
const choose = (p, label) => p.click(`[role="radio"]:has-text("${label}")`);

/** Ask a teammate on a message, pick Tony and start typing. */
async function startAsking(p, step = QUIC) {
  await askAbout(p, step);
  await p.click('text=Tony Reyes');
  await note(p).fill(NOTE);
}

describe.skipIf(!browserAvailable)('the ask sheet, closed before it was sent', () => {
  it('opens again on Ask a teammate as it was: Tony, Review and the note, the message back on Help', async () => {
    const p = await page();
    await startAsking(p);
    await choose(p, 'Review');
    await note(p).press('Escape');
    expect(await sheetOpen(p)).toBe(false);
    await askAbout(p);
    expect(await sheetFor(p)).toBe('Tony');
    expect(await picked(p)).toBe('Review');
    expect(await p.locator('.sh-step').count()).toBe(0);
    expect(await note(p).inputValue()).toBe(NOTE);
    await choose(p, 'Help');
    expect(await quote(p)).toBe(QUIC);
    await p.click('text=Ask Tony to help');
    expect(await calls(p)).toEqual([['ask', 'u-tony', 'help', NOTE, QUIC]]);
    await p.close();
  });

  it('opens on Tony again after a click outside with nothing typed, which closes it', async () => {
    const p = await page();
    await askAbout(p);
    await p.click('text=Tony Reyes');
    await p.click('#away');
    expect(await sheetOpen(p)).toBe(false);
    await askAbout(p);
    expect(await sheetFor(p)).toBe('Tony');
    expect(await note(p).inputValue()).toBe('');
    await p.close();
  });

  it('stays open on a click outside with words typed', async () => {
    const p = await page();
    await startAsking(p);
    await p.click('#away');
    expect(await note(p).inputValue()).toBe(NOTE);
    await p.close();
  });

  it('opens again after leaving the thread and coming back', async () => {
    const p = await page();
    await startAsking(p);
    await note(p).press('Escape');
    await mount(p, 'w-2');
    await mount(p, 'w-1');
    await askAbout(p);
    expect(await sheetFor(p)).toBe('Tony');
    expect(await note(p).inputValue()).toBe(NOTE);
    await p.close();
  });

  it('asked about another message, points at that one', async () => {
    const p = await page();
    await startAsking(p);
    await note(p).press('Escape');
    await askAbout(p, PORT);
    expect(await quote(p)).toBe(PORT);
    expect(await note(p).inputValue()).toBe(NOTE);
    await p.close();
  });

  it('opens on the people when it was for someone already asked or gone', async () => {
    const p = await page();
    await startAsking(p);
    await note(p).press('Escape');
    await mount(p, 'w-1', [{ ...TONY, asked: true }, MAYA]);
    await askAbout(p);
    expect(await sheetOpen(p)).toBe(false);
    await mount(p, 'w-1', [MAYA]);
    await askAbout(p);
    expect(await sheetOpen(p)).toBe(false);
    await p.close();
  });
});

describe.skipIf(!browserAvailable)('what is not carried', () => {
  it('Back to the people: Ask a teammate opens the list, and each person has their own note', async () => {
    const p = await page();
    await startAsking(p);
    await p.click('.sh-give .sh-back');
    await p.keyboard.press('Escape');
    await askAbout(p);
    expect(await sheetOpen(p)).toBe(false);
    await p.click('text=Maya Lin');
    expect(await note(p).inputValue()).toBe('');
    await p.click('.sh-give .sh-back');
    await p.click('text=Tony Reyes');
    expect(await note(p).inputValue()).toBe(NOTE);
    await p.close();
  });

  it('an ask once sent: the next one starts from the people, on Help, with an empty note', async () => {
    const p = await page();
    await startAsking(p);
    await choose(p, 'Review');
    await p.click('text=Ask Tony to review');
    expect(await calls(p)).toEqual([['ask', 'u-tony', 'review', NOTE, null]]);
    await askAbout(p);
    expect(await sheetOpen(p)).toBe(false);
    await p.click('text=Tony Reyes');
    expect(await note(p).inputValue()).toBe('');
    expect(await picked(p)).toBe('Help');
    await p.close();
  });

  it('a thread once handed over', async () => {
    const p = await page();
    await p.click('button[aria-label="More actions"]');
    await p.click('text=Ask or hand over…');
    await p.click('text=Tony Reyes');
    await choose(p, 'Hand over');
    await note(p).fill('It is yours from here.');
    await p.click('text=Hand over to Tony');
    expect(await calls(p)).toEqual([['give', 'u-tony', 'It is yours from here.']]);
    await askAbout(p);
    expect(await sheetOpen(p)).toBe(false);
    await p.close();
  });

  it('another thread: its sheet starts empty', async () => {
    const p = await page();
    await startAsking(p);
    await note(p).press('Escape');
    await mount(p, 'w-2');
    await askAbout(p);
    expect(await sheetOpen(p)).toBe(false);
    await p.click('text=Tony Reyes');
    expect(await note(p).inputValue()).toBe('');
    await p.close();
  });
});

describe('the kept sheet in the store', () => {
  const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), m }; };
  const thread = { product: 'api', id: 'w-1' };
  it('reads back each note and the sheet it was on, and nothing once neither is left', () => {
    const s = memory();
    saveAskDraft(thread, { notes: { 'u-tony': 'Check the firewall', 'u-maya': '' }, last: { to: TONY, mode: 'review' } }, s);
    expect(readAskDraft(thread, s)).toEqual({ notes: { 'u-tony': 'Check the firewall' }, last: { to: TONY, mode: 'review' } });
    expect(readAskDraft({ product: 'api', id: 'w-2' }, s)).toEqual({ notes: {}, last: null });
    saveAskDraft(thread, { notes: { 'u-tony': '' }, last: null }, s);
    expect(s.m.size).toBe(0);
  });
  it('reads a damaged entry as nothing kept rather than as half a sheet', () => {
    const s = memory();
    for (const bad of ['{', '"text"', JSON.stringify({ notes: ['x'], last: { to: { id: 'u-tony' }, mode: 'help' } }), JSON.stringify({ notes: { 'u-tony': 3 }, last: { to: TONY, mode: 'shout' } })]) {
      s.m.clear();
      s.m.set('zero.askdraft.api:w-1', bad);
      expect(readAskDraft(thread, s)).toEqual({ notes: {}, last: null });
    }
  });
});
