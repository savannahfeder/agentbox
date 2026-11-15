// A WRONG PASSWORD IS EASY TO READ, AND GOES WHEN YOU FIX IT.
//
// What broke (QA batch 005, F-116, on the hosted phone site at 390px):
// "Invalid login credentials" came back as small, low-contrast orange text —
// 13px of #e8836b on the card, the faintest thing on the screen — and it was
// still there after the password had been retyped, so a fixed password looked
// like a second failure. Measured in Chromium at phone width: the line's own
// size and contrast against what it is drawn on, and whether a keystroke in
// either field clears it.
import { describe, it, expect } from 'vitest';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium?.executablePath?.() ?? '');

// sRGB relative luminance, for the contrast ratio WCAG defines.
const lum = ([r, g, b]) => {
  const c = [r, g, b].map((v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : (((v / 255) + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
const rgb = (s) => s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);

async function openSignIn() {
  const bundle = await build({
    stdin: {
      contents: `import React from 'react';
        import {createRoot} from 'react-dom/client';
        import {SignInPage} from './renderer/src/team/SignInPage';
        import './renderer/src/styles.css';
        createRoot(document.getElementById('root')).render(
          <SignInPage purpose="cloud" onClose={() => {}} />);`,
      resolveDir: process.cwd(), loader: 'tsx',
    },
    bundle: true, write: false, format: 'iife', jsx: 'automatic',
    loader: { '.css': 'text', '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl' },
  });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.setContent('<html data-theme="dark" data-door="phone"><body><div id="root"></div></body></html>');
  // The sign-in refuses, as the cloud did with the wrong password.
  await page.addInitScript(() => {});
  await page.evaluate(() => {
    window.zero = { cloudAccountSignIn: async () => ({ ok: false, error: 'Invalid login credentials' }) };
  });
  await page.addStyleTag({ path: 'renderer/src/styles.css' });
  await page.addStyleTag({ path: 'renderer/src/team/sign-in.css' });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.getByLabel('Email').fill('someone@example.com');
  await page.locator('.si-pw input').fill('wrong-one');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.locator('.si-error').waitFor();
  return { browser, page };
}

describe.skipIf(!browserAvailable)('the wrong-password line', () => {
  it('is big enough and bright enough to read on a phone', async () => {
    const { browser, page } = await openSignIn();
    try {
      const seen = await page.locator('.si-error').evaluate((el) => {
        // What the eye is actually given: every half-transparent layer from the
        // line down to the first solid one, composited.
        const parts = (c) => c.match(/[\d.]+/g).map(Number);
        const layers = [];
        for (let n = el; n; n = n.parentElement) {
          const [r, g, b, a = 1] = parts(getComputedStyle(n).backgroundColor);
          if (a === 0) continue;
          layers.push([r, g, b, a]);
          if (a === 1) break;
        }
        const bg = layers.reverse().reduce((under, [r, g, b, a]) =>
          [r, g, b].map((v, i) => a * v + (1 - a) * under[i]), [0, 0, 0]);
        const s = getComputedStyle(el);
        return { size: parseFloat(s.fontSize), weight: Number(s.fontWeight), color: s.color, bg: `rgb(${bg.join()})`, text: el.textContent };
      });
      expect(seen.text).toContain('Invalid login credentials');
      // WCAG AA for body text is 4.5:1; the line was 3.1:1 at 13px.
      expect(ratio(rgb(seen.color), rgb(seen.bg))).toBeGreaterThanOrEqual(4.5);
      expect(seen.size).toBeGreaterThanOrEqual(14);
      expect(seen.weight).toBeGreaterThanOrEqual(500);
    } finally { await browser.close(); }
  });

  it('goes as soon as the password is edited', async () => {
    const { browser, page } = await openSignIn();
    try {
      await page.locator('.si-pw input').fill('the-right-one');
      expect(await page.locator('.si-error').count()).toBe(0);
    } finally { await browser.close(); }
  });

  // The boundary on the other side: the email is as much a fix as the password.
  it('goes when the email is edited too', async () => {
    const { browser, page } = await openSignIn();
    try {
      await page.getByLabel('Email').fill('someone-else@example.com');
      expect(await page.locator('.si-error').count()).toBe(0);
    } finally { await browser.close(); }
  });

  // The case that must NOT match: nothing touched, the line stays. An error
  // that cleared on its own would hide the thing it is there to say.
  it('stays while nothing has been changed', async () => {
    const { browser, page } = await openSignIn();
    try {
      await page.locator('.si-pw input').click();
      await page.waitForTimeout(80);
      expect(await page.locator('.si-error').count()).toBe(1);
    } finally { await browser.close(); }
  });
});
