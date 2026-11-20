// THE SEND SHEET'S NOTE IS A FIELD, LINED UP WITH THE STEP ABOVE IT (2026-11-20).
//
// Share… › Send to Lena › Help with this step, then a three-line note. The
// note had no border, so it read as loose text rather than a box you type in;
// its words started 10px left of the quoted step's; and at two rows tall it
// scrolled its first line out of sight under the quote. Rendered here with the
// app's own styles, at the sheet's width, and measured.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium.executablePath());

const css = ['styles.css', 'soft-corners.css', 'threads/pages.css', 'threads/share.css']
  .map((f) => readFileSync(new URL(`../renderer/src/${f}`, import.meta.url), 'utf8')).join('\n');
const note = 'Lena, the dates come in from the booking form. Should the API reject bad dates with 400, or does the web app already block them? Pick one and say why.';

let browser, bundle;
beforeAll(async () => {
  if (!browserAvailable) return;
  bundle = (await build({
    stdin: { contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { SendSheet } from './renderer/src/threads/SharePanel';
      const people = [{ id: 'u-lena', name: 'Lena Fischer', email: 'lena@team.test' }];
      createRoot(document.getElementById('root')).render(
        <SendSheet people={people} start={['u-lena']} link onCopy={() => {}} onSend={() => {}}
          step={{ words: 'All three routes have unchecked input; here is the full table with a fix for each.' }}
          want="help" wants={['help', 'review', 'hand']} />);`,
    resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', logLevel: 'error',
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'empty', '.mp3': 'empty' },
  })).outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
}, 60_000);
afterAll(async () => { await browser?.close(); });

async function measure(typed: string) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.setContent(`<html data-theme="dark"><head><style>${css}</style></head><body><div id="root"></div></body></html>`);
  await page.addScriptTag({ content: bundle });
  const box = page.locator('.sh-note');
  await box.waitFor();
  if (typed) await box.fill(typed);
  const out = await page.evaluate(() => {
    const step = document.querySelector('.sh-step') as HTMLElement;
    const field = document.querySelector('.sh-note') as HTMLTextAreaElement;
    const textLeft = (el: HTMLElement) => {
      const s = getComputedStyle(el);
      return el.getBoundingClientRect().left + parseFloat(s.borderLeftWidth) + parseFloat(s.paddingLeft);
    };
    const f = getComputedStyle(field);
    return {
      stepLeft: textLeft(step), noteLeft: textLeft(field),
      stepEdge: step.getBoundingClientRect().left, noteEdge: field.getBoundingClientRect().left,
      stepRight: step.getBoundingClientRect().right, noteRight: field.getBoundingClientRect().right,
      border: parseFloat(f.borderTopWidth), borderStyle: f.borderTopStyle, radius: parseFloat(f.borderTopLeftRadius),
      hidden: field.scrollHeight - field.clientHeight, scrolled: field.scrollTop,
    };
  });
  await page.close();
  return out;
}

describe.skipIf(!browserAvailable)("the send sheet's note", () => {
  it('has a visible, rounded border, so it reads as a box to type in', async () => {
    const m = await measure('');
    expect(m.borderStyle).toBe('solid');
    expect(m.border).toBeGreaterThanOrEqual(1);
    expect(m.radius).toBeGreaterThan(0);
  });

  it('starts its words, and its box, where the quoted step does', async () => {
    const m = await measure(note);
    expect(Math.abs(m.noteLeft - m.stepLeft)).toBeLessThan(0.5);
    expect(Math.abs(m.noteEdge - m.stepEdge)).toBeLessThan(0.5);
    expect(Math.abs(m.noteRight - m.stepRight)).toBeLessThan(0.5);
  });

  it('grows with a three-line note instead of scrolling its first line away', async () => {
    const m = await measure(note);
    expect(m.hidden).toBeLessThanOrEqual(0);
    expect(m.scrolled).toBe(0);
  });

  it('stops growing at a long note and scrolls inside its border', async () => {
    const m = await measure(Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n'));
    expect(m.hidden).toBeGreaterThan(0);
  });
});
