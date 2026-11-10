// A TEST BROWSER THAT NEVER LOADS FALLS BACK TO GOOGLE CHROME.
//
// What broke (w-cad26266fb, 2026-11-10): Playwright's Chrome for Testing
// 158.0.8127.18 aborted every renderer on macOS 27.0.1 (crash report:
// AperitifCheckInitialized, SIGABRT), so `browse.mjs open` connected, never
// loaded the page, and timed out at 90 s. Two power tests that night had every
// tester locked out for the whole run. Measured: Google Chrome 157 drew the same
// copy's inbox in 9 s; with the fallback, `browse.mjs open` drew it in 28 s.
//
// Now the hidden browser tries Chrome for Testing for 20 s, then Google Chrome.
import { describe, it, expect } from 'vitest';
import { browsersToTry, MAC_CHROME } from '../.claude/skills/verify-agentbox/scripts/cdp.mjs';

const CFT = '/cache/chromium-1254/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

describe('the browsers a hidden drive tries', () => {
  it('tries Chrome for Testing on a deadline, then Google Chrome with none', () => {
    expect(browsersToTry(CFT, () => true)).toEqual([{ bin: CFT, loadMs: 20_000 }, { bin: MAC_CHROME, loadMs: null }]);
  });

  it('gives Google Chrome no deadline when it is the only browser', () => {
    expect(browsersToTry(MAC_CHROME, () => true)).toEqual([{ bin: MAC_CHROME, loadMs: null }]);
  });

  it('has nothing to fall back to where there is no Google Chrome, as on Linux', () => {
    expect(browsersToTry('/usr/bin/chromium', () => false)).toEqual([{ bin: '/usr/bin/chromium', loadMs: null }]);
  });
});
