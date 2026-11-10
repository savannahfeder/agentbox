// AN OPEN TASK'S TEXT GROWS WITH THE WINDOW AND SITS LEFT OF CENTRE (w-d53ba8c96c).
//
// What broke: on a 1710pt window the task page was a centred 1116pt box whose
// sentences stopped at 760pt, so the words hugged the left of a centred box,
// the reply box ran 356pt past them, and the right third of the window was
// empty. Measured in the built renderer at 1710x1076 against the person's own
// screenshot: words 327..1087, reply 327..1443. Zoomed in, the box filled the
// window and the type grew, and they liked that; pressed against the left edge
// (an earlier proposal at 61pt in) was "far too left-aligned".
//
// The approved layout: the type scales with the pane, the column is 47.5em of
// it, it starts 35% of the way into the spare room, and the reply box keeps the
// bottom of the window at the column's exact width and left edge. It first
// shipped at 21px on a 1710 window, bigger than every reading page measured
// (GitHub and Wikipedia 16px, Linear and Anthropic's docs 17px, a Substack post
// 19px), so it is now 17px there, about 16px on a 1440 laptop and at most 18px,
// and the small lines never drop below the sizes they had before. Measured here
// the way it was found: the real stylesheets over the task page's own classes
// in Chromium, at the pane widths those windows give (1606 and 1336).
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium?.executablePath?.() ?? '');

const SHEETS = [
  'renderer/src/styles.css',
  'renderer/src/workspace-navigation.css',
  'renderer/src/one-thing-at-a-time.css',
  'renderer/src/phone.css',
];

const WORDS = 'Since this branch started, main added a change that makes Command-F work in a file opened full screen. '.repeat(4);

const html = (appClass, paneWidth) => `<html data-theme="dark"><body style="margin:0">
  <div class="${appClass}" data-reading-width="balanced" style="height:100vh">
    <div class="focus-pane" style="height:100vh;${paneWidth ? `width:${paneWidth}px;box-sizing:border-box` : ''}">
      <div class="focus-scroll"><div class="focus">
        <div class="focus-body markdown agent-thread">
          <div class="one-sum"><h2 class="one-title">Document auto-save feature</h2>
            <div class="one-head"><button class="one-earlier">Show 39 earlier messages</button></div>
            <div class="one-cols"><div class="one-col summary">${WORDS}</div></div></div>
          <div class="outcome one-answer"><h1 class="one-q">The merge conflict is fixed.</h1><p class="words">${WORDS}</p></div>
          <p class="one-app-note">Shipped to main.</p>
        </div>
        <section class="one-file one-note"><div class="one-filehead">auto-save.md</div></section>
      </div></div>
      <div class="focus-dock"><div class="focus-dock-inner"><div class="dock-card"><button class="dock-pill">Reply...</button></div></div></div>
    </div>
  </div></body></html>`;

const TASK = 'app workspace-layout workspace-task one-at-a-time';

async function measure(width, appClass = TASK, height = 1000, paneWidth = 0) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.setContent(html(appClass, paneWidth));
    for (const path of SHEETS) await page.addStyleTag({ path });
    return await page.evaluate(() => {
      const r = (sel) => document.querySelector(sel).getBoundingClientRect();
      const words = document.querySelector('.words');
      const el = document.querySelector('.focus-pane');
      const cs = getComputedStyle(el);
      const outer = el.getBoundingClientRect();
      const left = outer.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft);
      const right = outer.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight);
      return {
        pane: { left, right, width: right - left }, words: r('.words'), reply: r('.dock-card'), file: r('.one-file'),
        summary: r('.one-cols'), summaryFont: parseFloat(getComputedStyle(document.querySelector('.summary')).fontSize),
        font: parseFloat(getComputedStyle(words).fontSize),
        small: Object.fromEntries(['.one-earlier', '.one-app-note', '.dock-pill'].map((s) => [s, parseFloat(getComputedStyle(document.querySelector(s)).fontSize)])),
      };
    });
  } finally { await browser.close(); }
}

// The pane each window gives, and the text size it was approved at.
const WINDOWS = [
  { window: 1440, pane: 1336, type: 16.3 },
  { window: 1710, pane: 1606, type: 17 },
  { window: 2560, pane: 2456, type: 18 },
];

describe.skipIf(!browserAvailable)('an open task on a desktop window', () => {
  for (const { window, pane, type } of WINDOWS) {
    it(`on a ${window}pt window the text is ${type}px and the column sits a third into the spare room`, async () => {
      const m = await measure(window, TASK, 1000, pane);
      expect(m.font).toBeCloseTo(type, 1);
      expect(m.words.width).toBeCloseTo(m.font * 47.5, 0);
      const spare = m.pane.width - m.words.width;
      expect(m.words.left - m.pane.left).toBeCloseTo(spare * 0.35, 0);
    });
  }

  it('the small lines never drop below the sizes they had before', async () => {
    const m = await measure(1440, TASK, 1000, 1336);
    expect(m.summaryFont).toBeGreaterThanOrEqual(13.5);
    expect(m.small['.one-earlier']).toBeGreaterThanOrEqual(12.5);
    expect(m.small['.one-app-note']).toBeGreaterThanOrEqual(13);
    expect(m.small['.dock-pill']).toBeGreaterThanOrEqual(14.5);
  });

  it('the reply box and a file in the thread take the column\'s exact edges', async () => {
    const m = await measure(1710);
    expect(Math.abs(m.reply.left - m.words.left)).toBeLessThan(0.5);
    expect(Math.abs(m.reply.right - m.words.right)).toBeLessThan(0.5);
    expect(Math.abs(m.file.left - m.words.left)).toBeLessThan(0.5);
    expect(Math.abs(m.file.right - m.words.right)).toBeLessThan(0.5);
  });

  // The summary was a 680px box of 13.5px text before the column grew, and
  // running it the column's full width read as "goes out further".
  for (const pane of [1440, 1710]) {
    it(`on a ${pane}pt window the summary keeps its old measure, narrower than the answer`, async () => {
      const m = await measure(pane);
      expect(m.summary.width).toBeLessThanOrEqual(m.summaryFont * (680 / 13.5) + 1);
      expect(m.summary.width).toBeLessThan(m.words.width);
    });
  }

  it('a narrow window keeps room on both sides instead of running off', async () => {
    const m = await measure(820);
    expect(m.font).toBe(16);
    expect(m.words.left - m.pane.left).toBeGreaterThanOrEqual(32);
    expect(m.pane.right - m.words.right).toBeGreaterThanOrEqual(32);
  });
});

describe.skipIf(!browserAvailable)('where the layout must not reach', () => {
  it('a file open on the side keeps the thread as it was', async () => {
    const m = await measure(1710, `${TASK} doc-open`);
    expect(m.font).toBe(16);
  });
  it('a phone keeps its own layout', async () => {
    const m = await measure(390, TASK, 844);
    expect(m.font).toBe(16);
  });
  it('a page that is not an open task keeps its old size', async () => {
    const m = await measure(1710, 'app workspace-layout workspace-task');
    expect(m.font).toBe(16);
  });
});
