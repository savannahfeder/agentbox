// A PHONE'S TOAST NEVER COVERS THE THREAD IT NAMES, AND SETTINGS SAYS ITS TAB
// STRIP SCROLLS.
//
// What broke (QA batch 005, F-122): "Started in Web Todo / Undo" was drawn over
// the title of the thread it had just started — the one line it exists to point
// at — because on a phone the toast is a fixed line under the top bar and the
// list starts there too. And the Settings tab strip was clipped mid-word at
// both edges with nothing to say it scrolled, so the pages past the clip were
// not looked for. Measured in Chromium at 390px: where the toast's box lands
// against the first row's title, and whether the strip fades at its edges.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium?.executablePath?.() ?? '');

const SHEETS = ['renderer/src/styles.css', 'renderer/src/threads/pages.css', 'renderer/src/phone.css'];

const PAGE = `<html data-theme="dark" data-door="phone"><body>
  <div class="app workspace-layout">
    <div class="topbar"><h1 class="workspace-title">Threads</h1></div>
    <div class="body"><div class="list-pane"><div class="list th-table">
      <div class="row"><span class="mark"></span><div class="th-grid">
        <span class="subject">A page for the todo list</span><span class="th-where">Web Todo</span><span class="th-when">just now</span>
      </div></div>
      <div class="row"><span class="mark"></span><div class="th-grid">
        <span class="subject">README Usage section</span><span class="th-where">Web Todo</span><span class="th-when">4 min ago</span>
      </div></div>
    </div></div></div>
    <button class="toast toast-goes"><span class="toast-line">Started in Web Todo</span></button>
  </div></body></html>`;

async function phoneWithToast() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.setContent(PAGE);
  for (const path of SHEETS) await page.addStyleTag({ path });
  return { browser, page };
}

describe.skipIf(!browserAvailable)('the toast on a phone', () => {
  it('leaves the first row\'s title where it can be read', async () => {
    const { browser, page } = await phoneWithToast();
    try {
      const seen = await page.evaluate(() => {
        const t = document.querySelector('.toast').getBoundingClientRect();
        const first = document.querySelector('.row .subject').getBoundingClientRect();
        return { toastBottom: t.bottom, titleTop: first.top, titleText: document.querySelector('.row .subject').textContent };
      });
      expect(seen.titleText).toBe('A page for the todo list');
      expect(seen.titleTop).toBeGreaterThanOrEqual(seen.toastBottom);
    } finally { await browser.close(); }
  });

  // The boundary on the other side: with no toast the list sits where it
  // always did, so nothing is pushed down for a toast that is not there.
  it('and gives the room back the moment it goes', async () => {
    const { browser, page } = await phoneWithToast();
    try {
      const withIt = await page.locator('.row .subject').first().evaluate((el) => el.getBoundingClientRect().top);
      await page.locator('.toast').evaluate((el) => el.remove());
      const without = await page.locator('.row .subject').first().evaluate((el) => el.getBoundingClientRect().top);
      expect(without).toBeLessThan(withIt);
    } finally { await browser.close(); }
  });
});

describe('the Settings tab strip', () => {
  it('fades at both edges rather than cutting a word off', () => {
    const phone = readFileSync(new URL('../renderer/src/phone.css', import.meta.url), 'utf8');
    const at = phone.indexOf(':root:root:root .settings-screen .set-nav-scroll {');
    expect(at).toBeGreaterThan(-1);
    const rule = phone.slice(at, phone.indexOf('}', at));
    expect(rule).toMatch(/overflow-x: auto/);
    expect(rule).toMatch(/-webkit-mask-image: linear-gradient\(90deg,/);
    expect(rule).toMatch(/[^-]mask-image: linear-gradient\(90deg,/);
  });
});
