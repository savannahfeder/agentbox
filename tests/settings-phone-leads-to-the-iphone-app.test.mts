// SETTINGS › PHONE LEADS TO THE IOS APP (2026-11-15).
//
// The iOS app went on the App Store on 2026-11-11, but Settings › Phone only
// drew a QR code for the phone website, and only once you were signed in.
// Asked before the launch post: "If we go into Settings under, let's say,
// Phone, it should probably bring you to where you can download the mobile
// app." Measured by rendering the page signed in and signed out: neither named
// the App Store. Now both lead with the app's QR code and its App Store link.
//
// Then: "I don't know if the web version is something we want to point people
// toward because it's really messed up ... Maybe we have a 'Request the
// Android app' button." So the website is not named, and Android gets a button
// that opens Feedback with the request already written.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IPHONE_APP_URL } from '../shared/phone-app.mts';
import { ANDROID_ASK, PhonePage } from '../renderer/src/components/Settings';

const eas = JSON.parse(fs.readFileSync(new URL('../mobile/eas.json', import.meta.url), 'utf8'));
const draw = (props) => renderToStaticMarkup(React.createElement(PhonePage, props));
const site = 'https://phone.example.test';
const macShut = (over = {}) => ({ site, siteQr: '<svg/>', all: true, projects: [], onChoose: () => {}, email: 'me@example.test', sentAt: 1, ...over });

describe('the App Store link', () => {
  it('is the app the phone build submits to', () => {
    expect(IPHONE_APP_URL).toBe(`https://apps.apple.com/app/id${eas.submit.production.ios.ascAppId}`);
  });
});

describe('Settings › Phone', () => {
  it('signed in, it leads with the iOS app and says which account to sign in with', () => {
    const page = draw({ macShut: macShut(), onFeedback: () => {} });
    expect(page).toContain(`href="${IPHONE_APP_URL}"`);
    expect(page).toContain('for iOS');
    expect(page.indexOf(IPHONE_APP_URL)).toBeLessThan(page.indexOf('Projects on your phone'));
    expect(page).toContain('me@example.test');
  });

  it('signed out, it still offers the app, beside the way to sign in', () => {
    const page = draw({ onSignIn: () => {}, onFeedback: () => {} });
    expect(page).toContain(`href="${IPHONE_APP_URL}"`);
    expect(page).toContain('Sign in to use your phone');
    expect(page).toContain('Request the Android app');
  });

  it('must NOT point anyone at the phone website, even when this computer knows its address', () => {
    const page = draw({ macShut: macShut(), onFeedback: () => {} });
    expect(page).not.toContain('phone.example.test');
    expect(page).not.toContain('QR code that opens phone.example.test');
  });

  it('offers to request the Android app only where Feedback can open', () => {
    expect(draw({ macShut: macShut(), onFeedback: () => {} })).toContain('Request the Android app');
    expect(draw({ macShut: macShut() })).not.toContain('Request the Android app');
  });

  it('must NOT offer the App Store inside the web app, which is already on the phone', () => {
    const page = draw({ web: { email: 'me@example.test', seenAt: 0, cloud: true, onSignOut: () => {} } });
    expect(page).not.toContain(IPHONE_APP_URL);
  });
});

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = !!chromium && fs.existsSync(chromium.executablePath());
let browser, bundle;

beforeAll(async () => {
  if (!browserAvailable) return;
  bundle = (await build({
    stdin: { contents: `
      import React, { useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { PhonePage } from './renderer/src/components/Settings';
      import { FeedbackCard } from './renderer/src/components/FeedbackCard';
      function Page() {
        const [open, setOpen] = useState(null);
        return <>
          <PhonePage onSignIn={() => {}} onFeedback={(start) => setOpen(start ?? '')} />
          {open !== null && <FeedbackCard start={open} onClose={() => setOpen(null)} onSend={async (p) => { window.sent = p; return { ok: true }; }} />}
        </>;
      }
      createRoot(document.getElementById('root')).render(<Page />);`,
    resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', loader: { '.css': 'empty' }, jsx: 'automatic', logLevel: 'error',
    // Settings reaches look-switch.ts, which reads a folder through Vite's import.meta.glob.
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.glob': 'globalThis.__noGlob' }, banner: { js: 'globalThis.__noGlob = () => ({});' },
  })).outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => { await browser?.close(); });

describe('Request the Android app', () => {
  it.skipIf(!browserAvailable)('opens Feedback with the request written, ready to send', async () => {
    const page = await browser.newPage();
    page.setDefaultTimeout(5_000);
    await page.route('http://phone.test/**', (route) => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
    await page.goto('http://phone.test/');
    await page.addScriptTag({ content: bundle });
    await page.getByRole('button', { name: 'Request the Android app' }).click();
    const box = page.getByRole('textbox', { name: 'Your feedback' });
    expect(await box.inputValue()).toBe(ANDROID_ASK);
    await page.close();
  });
});
