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
// The approved layout: the type scales with the pane (19px on a 1440 window,
// 21px on 1710, at most 22px), the column is 47.5em of it, it starts 35% of the
// way into the spare room, and the reply box keeps the bottom of the window at
// the column's exact width and left edge. Measured here the way it was found:
// the real stylesheets over the task page's own classes in Chromium.
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

const html = (appClass) => `<html data-theme="dark"><body style="margin:0">
  <div class="${appClass}" data-reading-width="balanced" style="height:100vh">
    <div class="focus-pane" style="height:100vh">
      <div class="focus-scroll"><div class="focus">
        <div class="focus-body markdown agent-thread">
          <div class="one-sum"><h2 class="one-title">Document auto-save feature</h2></div>
          <div class="outcome one-answer"><h1 class="one-q">The merge conflict is fixed.</h1><p class="words">${WORDS}</p></div>
        </div>
        <section class="one-file one-note"><div class="one-filehead">auto-save.md</div></section>
      </div></div>
      <div class="focus-dock"><div class="focus-dock-inner"><div class="dock-card"><button class="dock-pill">Reply...</button></div></div></div>
    </div>
  </div></body></html>`;

const TASK = 'app workspace-layout workspace-task one-at-a-time';

async function measure(width, appClass = TASK, height = 1000) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.setContent(html(appClass));
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
        font: parseFloat(getComputedStyle(words).fontSize),
      };
    });
  } finally { await browser.close(); }
}

const typeFor = (pane) => Math.min(22, Math.max(16, 0.0075 * pane + 9));

describe.skipIf(!browserAvailable)('an open task on a desktop window', () => {
  for (const pane of [1440, 1710, 2560]) {
    it(`on a ${pane}pt window the text grows and the column sits a third into the spare room`, async () => {
      const m = await measure(pane);
      expect(m.font).toBeCloseTo(typeFor(m.pane.width), 1);
      expect(m.words.width).toBeCloseTo(m.font * 47.5, 0);
      const spare = m.pane.width - m.words.width;
      expect(m.words.left - m.pane.left).toBeCloseTo(spare * 0.35, 0);
    });
  }

  it('the reply box and a file in the thread take the column\'s exact edges', async () => {
    const m = await measure(1710);
    expect(Math.abs(m.reply.left - m.words.left)).toBeLessThan(0.5);
    expect(Math.abs(m.reply.right - m.words.right)).toBeLessThan(0.5);
    expect(Math.abs(m.file.left - m.words.left)).toBeLessThan(0.5);
    expect(Math.abs(m.file.right - m.words.right)).toBeLessThan(0.5);
  });

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
