// A KEY CARD'S BUTTONS STAY ON ONE LINE BESIDE THE REPLY BOX (w-95b511d7f0).
//
// Seen on screen: beside an open thread's Reply box the key card narrowed to
// its narrowest, 340px, and its three buttons squeezed. "Send the key" broke
// onto two lines and every ⌘ stood on top of its number. Measured in the
// browser copy with Geist: Send the key ⌘1, Deny ⌘2 and Reply ⌘3 take 312px
// with their gaps, and a 340px card leaves them 306. The card now narrows only
// as far as its own buttons allow, and stands above the box when that is not
// far enough; the buttons never shrink.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { cardPlace, CARD_FOOT, CARD_WIDTH, NARROWEST, SIDE_GAP } from '../renderer/src/room-for-the-card.ts';

describe('how far the card narrows for its buttons', () => {
  const VIEW = 900;
  const card = { left: 978, right: 1418, height: 224 };
  const box = (right: number) => ({ left: 280, right, top: 812, bottom: 853 });
  const need = 346;

  it('narrows to exactly what its buttons need', () => {
    expect(cardPlace(card, [box(1418 - SIDE_GAP - need)], VIEW, need)).toEqual({ lift: CARD_FOOT, width: need });
  });

  it('stands above the box at full width rather than go one pixel narrower', () => {
    expect(cardPlace(card, [box(1418 - SIDE_GAP - need + 1)], VIEW, need)).toEqual({ lift: VIEW - 812 + 8, width: CARD_WIDTH });
  });

  it('still narrows to its narrowest when its buttons need less', () => {
    expect(cardPlace(card, [box(1418 - SIDE_GAP - NARROWEST)], VIEW, 250)).toEqual({ lift: CARD_FOOT, width: NARROWEST });
  });
});

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium.executablePath());
const css = readFileSync(new URL('../renderer/src/styles.css', import.meta.url), 'utf8');
const geist = readFileSync(new URL('../renderer/src/assets/fonts/Geist-Variable.woff2', import.meta.url));

let browser, bundle;
beforeAll(async () => {
  if (!browserAvailable) return;
  bundle = (await build({
    stdin: { contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { KeyCardActions } from './renderer/src/components/KeyCardActions';
      import { CardKey } from './renderer/src/components/CardKey';
      import { roomForTheCard } from './renderer/src/room-for-the-card';
      const { keys, key: keyCard, boxRight } = window.__card;
      const chord = (k) => k.replace('⌘', keys);
      const send = <button className="approval-allow">{keyCard ? 'Send the key' : 'Allow'}<CardKey keys={chord('⌘1')} /></button>;
      const deny = <button className="approval-deny">Deny<CardKey keys={chord('⌘2')} /></button>;
      createRoot(document.getElementById('root')).render(<>
        <div className="dock-pill" style={{ position: 'fixed', left: 280, width: boxRight - 280, bottom: 47, height: 41 }} />
        <div className="approvals" ref={(el) => { if (el) roomForTheCard(el); }}>
          <div className="approval-stack"><div className="approval-card">
            <div className="approval-lede">Send this key to the cloud?</div>
            {keyCard
              ? <KeyCardActions send={send} deny={deny} chord={chord} replying={false} onReplying={() => {}} onReply={() => {}} />
              : <div className="approval-actions">{send}{deny}</div>}
          </div></div>
        </div>
      </>);`,
    resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', logLevel: 'error',
  })).outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
}, 60_000);
afterAll(async () => { await browser?.close(); });

/** The card beside a Reply box ending at `boxRight`, in a 1440 x 900 window, as the app places it. */
async function measure(card: { keys: string; key: boolean; boxRight: number }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(5_000);
  await page.route('http://fits.test/assets/fonts/**', (r) => r.fulfill({ contentType: 'font/woff2', body: geist }));
  await page.route('http://fits.test/', (r) => r.fulfill({ contentType: 'text/html',
    body: `<html data-theme="dark"><style>${css}</style><body><div id="root"></div></body></html>` }));
  await page.goto('http://fits.test/');
  await page.evaluate(() => document.fonts.load('600 13px Geist'));
  await page.addScriptTag({ content: `window.__card = ${JSON.stringify(card)};` });
  await page.addScriptTag({ content: bundle });
  await page.locator('.approval-actions').waitFor();
  await page.waitForTimeout(100);
  const m = await page.evaluate(() => {
    const rect = (e: Element) => e.getBoundingClientRect();
    const cardEl = document.querySelector('.approval-card')!;
    const c = rect(cardEl);
    const pad = parseFloat(getComputedStyle(cardEl).paddingRight) + parseFloat(getComputedStyle(cardEl).borderRightWidth);
    const box = rect(document.querySelector('.dock-pill')!);
    const buttons = [...document.querySelectorAll('.approval-actions > button')];
    // The top of every piece of ink in a button: its words, the drawn ⌘, the number.
    const lines = buttons.map((b) => {
      const tops: number[] = [];
      const walk = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
      for (let t = walk.nextNode(); t; t = walk.nextNode()) {
        const range = document.createRange(); range.selectNodeContents(t);
        for (const r of range.getClientRects()) if (r.width > 0) tops.push(r.top);
      }
      for (const s of b.querySelectorAll('svg')) tops.push(rect(s).top);
      return Math.max(...tops) - Math.min(...tops);
    });
    return {
      width: Math.round(c.width),
      lifted: Math.round(innerHeight - c.bottom) > 22,
      lines,
      inside: rect(buttons.at(-1)!).right <= c.right - pad + 0.5 && rect(buttons[0]).left >= c.left,
      clear: c.left >= box.right || c.bottom <= box.top,
    };
  });
  await page.close();
  return m;
}

const oneLine = (spreads: number[]) => spreads.every((s) => s < 8);

describe.skipIf(!browserAvailable)('the key card beside a box that leaves it 340px', () => {
  let m;
  beforeAll(async () => { m = await measure({ keys: '⌘', key: true, boxRight: 1418 - SIDE_GAP - NARROWEST }); }, 30_000);
  it('keeps every button on one line, each ⌘ beside its number', () => {
    expect(m.lines).toHaveLength(3);
    expect(oneLine(m.lines)).toBe(true);
  });
  it('keeps the buttons inside the card', () => expect(m.inside).toBe(true));
  it('does not cover the box', () => expect(m.clear).toBe(true));
});

// In Geist the buttons take 345.4px of card. A pixel of slack per button
// measured them at 349 and lifted a card that fitted, so this is 348.
describe.skipIf(!browserAvailable)('the key card beside a box that leaves it 348px', () => {
  let m;
  beforeAll(async () => { m = await measure({ keys: '⌘', key: true, boxRight: 1418 - SIDE_GAP - 348 }); }, 30_000);
  it('stays in its corner, narrowed', () => {
    expect(m.lifted).toBe(false);
    expect(m.width).toBe(348);
  });
  it('keeps every button on one line inside it', () => {
    expect(oneLine(m.lines)).toBe(true);
    expect(m.inside).toBe(true);
  });
});

describe.skipIf(!browserAvailable)('the key card with Ctrl keys, which are wider, at 400px', () => {
  let m;
  beforeAll(async () => { m = await measure({ keys: 'Ctrl+', key: true, boxRight: 1418 - SIDE_GAP - 400 }); }, 30_000);
  it('keeps every button on one line inside the card, and off the box', () => {
    expect(oneLine(m.lines)).toBe(true);
    expect(m.inside).toBe(true);
    expect(m.clear).toBe(true);
  });
});

describe.skipIf(!browserAvailable)('an Allow and Deny card beside a box that leaves it 340px', () => {
  let m;
  beforeAll(async () => { m = await measure({ keys: '⌘', key: false, boxRight: 1418 - SIDE_GAP - NARROWEST }); }, 30_000);
  it('still narrows to 340 in its corner, as before', () => {
    expect(m.lifted).toBe(false);
    expect(m.width).toBe(NARROWEST);
  });
  it('with both buttons on one line', () => expect(oneLine(m.lines)).toBe(true));
});
