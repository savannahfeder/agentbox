// THE APPROVAL CARD STOOD 1PX FROM A CHAT'S MESSAGE BOX (w-d4bac2245a).
//
// Beside a message box it reaches over, the card narrows to end 16px short of
// it. It measured the typing area, and a chat's typing area sits 15px inside
// the box's border, so the card stopped 1px from the frame you see. Measured in
// the demo copy at 1710x1107 on Lena's chat: the editor ended at x=1251, the
// box's border at 1266, and the card began at 1267.
//
// Rendered here with the app's own styles and its own measuring code: the gap
// is 16px to the frame of each framed box, and still 16px to a bare box that
// has no frame.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import type { Browser } from 'playwright';
import { SIDE_GAP } from '../renderer/src/room-for-the-card.ts';

const require = createRequire(import.meta.url);
let chromium: typeof import('playwright').chromium | undefined;
try { ({ chromium } = require('playwright')); } catch { /* no browser here */ }
const browserAvailable = !!chromium && existsSync(chromium.executablePath());

const css = ['team/rooms/rooms.css', 'styles.css', 'soft-corners.css']
  .map((f) => readFileSync(new URL(`../renderer/src/${f}`, import.meta.url), 'utf8')).join('\n');

let browser: Browser | undefined;
let bundle = '';
beforeAll(async () => {
  if (!browserAvailable) return;
  bundle = (await build({
    stdin: { contents: "import { roomForTheCard } from './renderer/src/room-for-the-card'; window.roomForTheCard = roomForTheCard;", resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, write: false, format: 'iife', logLevel: 'error',
  })).outputFiles[0].text;
  browser = await chromium!.launch({ headless: true });
}, 60_000);
afterAll(async () => { await browser?.close(); });

/** The card's left edge less the right edge of `measured`, with the box at the foot, under the card's corner. */
async function gap(box: string, measured: string) {
  const page = await browser!.newPage({ viewport: { width: 1600, height: 900 } });
  await page.setContent(`<style>${css}</style><div class="app">
    <div style="position:fixed;left:300px;width:860px;bottom:20px">${box}</div>
    <div class="approvals"><div style="height:200px"></div></div></div>`);
  await page.addScriptTag({ content: bundle });
  const at = await page.evaluate((measured) => {
    (window as unknown as { roomForTheCard: (el: Element) => void }).roomForTheCard(document.querySelector('.approvals')!);
    return document.querySelector('.approvals')!.getBoundingClientRect().left - document.querySelector(measured)!.getBoundingClientRect().right;
  }, measured);
  await page.close();
  return Math.round(at);
}

describe.skipIf(!browserAvailable)('the card beside a message box it reaches over', () => {
  it("leaves its gap to a chat box's border, not to the words inside it", async () => {
    expect(await gap('<div class="rm-compose"><div class="rm-compose-input"><div contenteditable="true">x</div></div></div>', '.rm-compose')).toBe(SIDE_GAP);
  });

  it("leaves its gap to a thread's reply box", async () => {
    expect(await gap('<div class="dock-card"><textarea class="dock-input" style="width:100%"></textarea></div>', '.dock-card')).toBe(SIDE_GAP);
  });

  it('leaves its gap to a bare box with no frame around it', async () => {
    expect(await gap('<textarea style="width:100%;margin:0"></textarea>', 'textarea')).toBe(SIDE_GAP);
  });
});
