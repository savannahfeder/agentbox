// A TALL PICTURE ON A TASK PAGE SHOWS WHOLE, SHRUNK TO FIT, NEVER CUT.
//
// What broke (w-495d1d7ad2): to keep a tall screenshot from filling several
// screens, the button around a picture was held to min(560px, 60vh) with
// `overflow: hidden`. A picture is drawn at the column's width, so a phone
// screenshot (780 x 1688) came out 782 x 1690 and only its top 560px showed;
// scrolling to the bottom of the thread never showed the rest, and only opening
// it full screen did. Measured in the built window at 1710 x 1107, dark, with
// two of those screenshots in an answer: each picture's box 1690 tall, its
// button 560.
//
// The part of the thread that scrolls in that window runs from 96 to 945, so
// the window less 258px is the room a picture has (the top bar above, the
// options and the reply box below).
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium?.executablePath?.() ?? '');

const SHEETS = ['renderer/src/styles.css', 'renderer/src/document-preview.css'];
const AROUND = 258;
const COLUMN = 830;

const picture = (w, h) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#444"/></svg>`)}`;

/** One picture in an answer, as Focus.tsx draws it, measured in Chromium. */
async function measure({ w, h, onPage = true, height = 1107 }) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1710, height } });
    await page.setContent(`<html data-theme="dark"><body>
      <div class="focus-pane"${onPage ? ' data-file-previews="page"' : ''}>
        <div class="markdown" style="width:${COLUMN}px"><p>Local fixture, new thread at 390 px.</p>
          <p><button type="button" class="inline-image-open"><img class="inline-image" src="${picture(w, h)}" alt=""></button></p>
        </div>
      </div></body></html>`);
    for (const path of SHEETS) await page.addStyleTag({ path });
    await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
    return await page.evaluate(() => {
      const img = document.querySelector('.inline-image');
      const r = img.getBoundingClientRect();
      // What of the picture is left once every box around it that clips has cut it.
      let top = r.top, bottom = r.bottom, left = r.left, right = r.right;
      for (let el = img.parentElement; el; el = el.parentElement) {
        const s = getComputedStyle(el);
        if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
        const c = el.getBoundingClientRect();
        top = Math.max(top, c.top); bottom = Math.min(bottom, c.bottom);
        left = Math.max(left, c.left); right = Math.min(right, c.right);
      }
      return {
        w: img.clientWidth, h: img.clientHeight,
        box: { w: r.width, h: r.height }, seen: { w: right - left, h: bottom - top },
        natural: { w: img.naturalWidth, h: img.naturalHeight },
      };
    });
  } finally { await browser.close(); }
}

const shapeOf = (m) => m.w / m.h;

describe.skipIf(!browserAvailable)('a tall picture on a task page', () => {
  it('shows whole: nothing around it cuts any of it off', async () => {
    const m = await measure({ w: 780, h: 1688 });
    expect(m.seen.h).toBeCloseTo(m.box.h, 0);
    expect(m.seen.w).toBeCloseTo(m.box.w, 0);
  });

  it('keeps its own shape as it shrinks', async () => {
    const m = await measure({ w: 780, h: 1688 });
    expect(shapeOf(m)).toBeCloseTo(780 / 1688, 2);
  });

  it('fits in the part of the window that scrolls, so one look takes in all of it', async () => {
    const m = await measure({ w: 780, h: 1688 });
    expect(m.box.h).toBeLessThanOrEqual(1107 - AROUND);
  });

  it('uses most of that room rather than shrinking to a thumbnail', async () => {
    const m = await measure({ w: 780, h: 1688 });
    expect(m.box.h).toBeGreaterThanOrEqual(1107 - AROUND - 100);
  });

  it('fits a short window too', async () => {
    const m = await measure({ w: 780, h: 1688, height: 700 });
    expect(m.box.h).toBeLessThanOrEqual(700 - AROUND);
    expect(m.seen.h).toBeCloseTo(m.box.h, 0);
  });

  it('shrinks a picture just over the room it has, whole and in shape', async () => {
    const m = await measure({ w: 400, h: 1107 - AROUND + 20 });
    expect(m.box.h).toBeLessThanOrEqual(1107 - AROUND);
    expect(m.seen.h).toBeCloseTo(m.box.h, 0);
    expect(shapeOf(m)).toBeCloseTo(400 / (1107 - AROUND + 20), 2);
  });

  it('leaves a picture that already fits at its own size', async () => {
    const m = await measure({ w: 800, h: 600 });
    expect([m.w, m.h]).toEqual([800, 600]);
  });

  it('leaves a wide screenshot at the column\'s width', async () => {
    const m = await measure({ w: 1600, h: 1000 });
    expect(m.box.w).toBeCloseTo(COLUMN, 0);
    expect(shapeOf(m)).toBeCloseTo(1.6, 2);
  });

  it('is left alone off a task page, at the column\'s width as before', async () => {
    const m = await measure({ w: 780, h: 1688, onPage: false });
    expect([m.w, m.h]).toEqual([780, 1688]);
  });
});

const read = (file) => readFileSync(new URL(`../renderer/src/${file}`, import.meta.url), 'utf8');

it('marks a task page so the rule above reaches only it', () => {
  expect(read('components/Focus.tsx')).toContain('data-file-previews={page && !inChats ? \'page\' : undefined}');
});

it('keeps the full-size opener on a click', () => {
  expect(read('components/Focus.tsx')).toContain('onClick={(e) => onOpen(path, e.currentTarget)}');
});
