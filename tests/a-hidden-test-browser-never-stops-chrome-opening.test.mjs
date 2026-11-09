// A HIDDEN TEST BROWSER NEVER STOPS CHROME OPENING.
//
// What broke (w-ad58adf417, 2026-11-07): during a phone-test workday, clicking
// Chrome in the Dock did nothing, even after force quitting it. The three
// testers each held a headless Chrome started from /Applications/Google
// Chrome.app, and `lsappinfo list` showed all three registered as "Google
// Chrome" (com.google.Chrome, BackgroundOnly). The Mac handed every click to
// one of them instead of starting the person's own Chrome, and Force Quit does
// not list background apps. `open -n -a "Google Chrome"` started the real one.
// The fix starts hidden drives in Playwright's Chrome for Testing, which has
// its own app id, whenever it is installed.
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findChrome, chromesForTesting } from '../.claude/skills/verify-agentbox/scripts/cdp.mjs';

const MAC = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const APP = 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const roots = [];
afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true }); });

function cache(layout) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-cache-'));
  roots.push(root);
  for (const rel of layout) {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '');
  }
  return root;
}

describe('the browser a hidden drive starts on a Mac', () => {
  it('is Chrome for Testing when Playwright installed it', () => {
    const exe = `/cache/chromium-1248/chrome-mac-arm64/${APP}`;
    expect(findChrome('darwin', {}, undefined, () => [exe])).toBe(exe);
  });

  it('is Google Chrome when there is no Chrome for Testing or headless shell', () => {
    expect(findChrome('darwin', {}, undefined, () => [], () => [])).toBe(MAC);
  });

  it('is not changed on Linux by a Chrome for Testing on disk', () => {
    expect(findChrome('linux', { VERIFY_CHROME: '/usr/bin/chromium' }, undefined, () => ['/x'])).toBe('/usr/bin/chromium');
  });
});

describe('finding Chrome for Testing in the Playwright cache', () => {
  it('lists the newest build first, on Apple silicon and Intel', () => {
    const root = cache([
      `chromium-1200/chrome-mac/${APP}`,
      `chromium-1248/chrome-mac-arm64/${APP}`,
    ]);
    expect(chromesForTesting(root)).toEqual([
      path.join(root, `chromium-1248/chrome-mac-arm64/${APP}`),
      path.join(root, `chromium-1200/chrome-mac/${APP}`),
    ]);
  });

  it('sorts builds by number, not by name', () => {
    const root = cache([`chromium-999/chrome-mac-arm64/${APP}`, `chromium-1001/chrome-mac-arm64/${APP}`]);
    expect(chromesForTesting(root)[0]).toContain('chromium-1001');
  });

  it('skips a half-installed build and the headless shell', () => {
    const root = cache([
      'chromium-1300/chrome-mac-arm64/ABOUT',
      `chromium_headless_shell-1400/chrome-mac-arm64/${APP}`,
    ]);
    expect(chromesForTesting(root)).toEqual([]);
  });

  it('is empty when there is no cache at all', () => {
    expect(chromesForTesting('/nowhere/at/all')).toEqual([]);
  });
});
