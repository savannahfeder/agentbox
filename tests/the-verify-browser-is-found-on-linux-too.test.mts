// THE VERIFY BROWSER IS FOUND ON LINUX TOO.
//
// What broke (w-811757c0b5, 2026-10-20): every live drive, the breaker and the
// power test drive the app through a headless Chrome, and cdp.mjs named only
// the Mac's Google Chrome. On the Linux cloud machine, where an hours-long
// power test belongs because it keeps the person's Mac free, `browse.mjs open`
// failed with "No Google Chrome at /Applications/…" although Playwright's
// Chromium was installed. Measured: with the fix, `browse.mjs open` drew the
// inbox from a copy started by `live.mjs up` on that machine.
import { describe, it, expect } from 'vitest';
import { findChrome } from '../.claude/skills/verify-agentbox/scripts/cdp.mjs';

const MAC = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const playwright = (p) => () => ({ chromium: { executablePath: () => p } });
const none = () => { throw new Error('Cannot find module playwright'); };

describe('which browser the verify drives start', () => {
  it('is Google Chrome on a Mac, whatever else is installed', () => {
    expect(findChrome('darwin', { VERIFY_CHROME: '/opt/other' }, playwright('/opt/pw/chrome'))).toBe(MAC);
  });

  it('is the one VERIFY_CHROME names elsewhere', () => {
    expect(findChrome('linux', { VERIFY_CHROME: '/usr/bin/chromium' }, playwright('/opt/pw/chrome'))).toBe('/usr/bin/chromium');
  });

  it('is Playwright\'s Chromium on Linux when nothing is named', () => {
    expect(findChrome('linux', {}, playwright('/opt/ms-playwright/chromium/chrome'))).toBe('/opt/ms-playwright/chromium/chrome');
  });

  it('falls back to the Mac path, and so to the error that names it, when there is no Playwright', () => {
    expect(findChrome('linux', {}, none)).toBe(MAC);
  });
});
