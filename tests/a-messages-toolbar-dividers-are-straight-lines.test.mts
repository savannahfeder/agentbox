// A MESSAGE'S TOOLBAR DIVIDERS ARE STRAIGHT LINES (2026-11-21).
//
// Hovering Theo's hand-over message showed the bar of reactions, Reply and
// Hand to an agent with a curved line left of each button: each button drew
// its own left border and was rounded, so the border bent at both ends. The
// dividers are now lines of their own. Rendered with the app's styles and
// measured.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium.executablePath());

const css = ['styles.css', 'soft-corners.css', 'team/chat.css']
  .map((f) => readFileSync(new URL(`../renderer/src/${f}`, import.meta.url), 'utf8')).join('\n');

let browser;
beforeAll(async () => { if (browserAvailable) browser = await chromium.launch({ headless: true }); }, 60_000);
afterAll(async () => { await browser?.close(); });

describe.skipIf(!browserAvailable)("a message's toolbar", () => {
  it('draws each divider as a straight line, not a curved button edge', async () => {
    const page = await browser.newPage();
    await page.setContent(`<html data-theme="dark"><head><style>${css}</style></head><body>
      <div class="chat-msg" style="position:relative;margin:60px"><div class="chat-acts open">
        <button class="chat-quick">👍</button><button class="chat-act">Reply</button><button class="chat-act">Hand to an agent</button>
      </div></div></body></html>`);
    const acts = await page.evaluate(() => [...document.querySelectorAll('.chat-act')].map((b) => {
      const s = getComputedStyle(b), line = getComputedStyle(b, '::before');
      return { border: s.borderLeftWidth, line: line.content !== 'none' ? { w: line.width, radius: line.borderTopLeftRadius } : null };
    }));
    await page.close();
    for (const a of acts) {
      expect(a.border).toBe('0px');
      expect(a.line).toEqual({ w: '1px', radius: '0px' });
    }
  });
});
