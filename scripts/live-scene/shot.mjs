#!/usr/bin/env node
// A picture of the scene's live file in a full, dark window.
//
//   node scripts/live-scene/shot.mjs --url <copy> --out <file.png> [--file launch-leads.csv] [--look flags] [--wait 9000] [--type " Maya posts at 9."]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const FILE = arg('file', 'launch-plan.md');
const THREAD = /\.(csv|tsv)$/i.test(FILE) ? 'Pick the first teams to write to' : 'Plan the launch together';
const OUT = arg('out');
const WAIT = Number(arg('wait', 9000));
const TYPE = arg('type', '');
fs.mkdirSync(path.dirname(OUT), { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.SHOT_CHROME ?? '/opt/agentbox/chromium.sh' });
const page = await browser.newPage({ viewport: { width: 1512, height: 945 }, deviceScaleFactor: 2, colorScheme: 'dark' });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(arg('url'));
await page.waitForTimeout(4000);
await page.evaluate((l) => localStorage.setItem('live-presence-look', l), arg('look', 'flags'));
await page.reload();
await page.waitForTimeout(3500);
await page.getByText(THREAD).first().click();
await page.waitForTimeout(1500);
await page.getByText(FILE).last().click();
await page.waitForSelector(/\.(csv|tsv)$/i.test(FILE) ? '.tbl' : '.ProseMirror', { timeout: 20_000 });
if (TYPE) {
  await page.locator('.ProseMirror > p').first().click();
  await page.keyboard.press('End');
  await page.waitForTimeout(Math.max(0, WAIT - 2500));
  if (Number(arg('frames', 1)) > 1) {
    // A picture after each typed word, so "You" is up in every one.
    const words = TYPE.match(/\s*\S+/g) ?? [];
    for (const [i, w] of words.entries()) {
      // Wait, up to a few seconds, for a person's name and an agent's to be up on
      // screen together, then type the next word so "You" is up too, and shoot.
      for (let k = 0; k < 80; k++) {
        const up = await page.evaluate((k) => {
          const shown = (sel) => [...document.querySelectorAll(sel)].some((c) => { const r = c.getBoundingClientRect(); return r.top > 80 && r.top < innerHeight - 40; });
          return shown('.lv-caret.is-fresh:not(.is-agent)') && (k > 40 || shown('.lv-caret.is-fresh.is-agent'));
        }, k);
        if (up) break;
        await page.waitForTimeout(150);
      }
      await page.keyboard.type(w, { delay: 40 });
      await page.waitForTimeout(120);
      await page.screenshot({ path: OUT.replace(/\.png$/, `-${i + 1}.png`) });
    }
    console.log(JSON.stringify({ out: OUT, frames: words.length, errors }));
    await browser.close();
    process.exit(0);
  }
  await page.keyboard.type(TYPE, { delay: 60 });
  await page.waitForTimeout(300);
} else {
  await page.waitForTimeout(WAIT);
}
// `--frames 4 --every 1500`: several pictures of the same moment's room, out-1.png, out-2.png...
const FRAMES = Number(arg('frames', 1));
for (let i = 1; i <= FRAMES; i++) {
  await page.screenshot({ path: FRAMES > 1 ? OUT.replace(/\.png$/, `-${i}.png`) : OUT });
  if (i < FRAMES) await page.waitForTimeout(Number(arg('every', 1500)));
}
console.log(JSON.stringify({ out: OUT, errors }));
await browser.close();
