// A MAC WITH THE HEADLESS SHELL NEVER STARTS CHROME FOR TESTING.
//
// What broke (w-a87d6ed562, 2026-11-23): "Google Chrome for Testing quit
// unexpectedly" boxes stacked four deep on the person's screen, over a
// keychain password box with that app's icon that came back after each
// password. Every hidden browser agents and testers start took Chrome for
// Testing whenever Playwright had installed it, and on this Mac that build
// aborted its renderers (2026-11-09, f2aa68da0) and twice stopped loading
// pages. It is an app, so each crash is a box, and its Reopen button starts
// it again without the keychain flags. The headless shell installed beside it
// is a bare program, not an app, and loaded the same pages each time. Measured
// by which binary the two pickers return with both installed.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { hiddenBrowser, startableChrome } from '../shared/hidden-browser.mts';

const ROOT = path.resolve(import.meta.dirname, '..');
// The skills are a private checkout, absent on GitHub and in a public clone.
const CDP = path.join(ROOT, '.claude/skills/verify-agentbox/scripts/cdp.mjs');
const cdp = fs.existsSync(CDP) ? await import(pathToFileURL(CDP).href) : null;

const CFT = '/cache/chromium-1254/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const SHELL = '/cache/chromium_headless_shell-1254/chrome-headless-shell-mac-arm64/chrome-headless-shell';

describe('the hidden browser on a Mac', () => {
  it('is the headless shell when Chrome for Testing is installed beside it', () => {
    expect(hiddenBrowser({ forTesting: () => [CFT], shells: () => [SHELL] })).toBe(SHELL);
    expect(startableChrome({ platform: 'darwin', env: {}, hidden: () => hiddenBrowser({ forTesting: () => [CFT], shells: () => [SHELL] }) })).toBe(SHELL);
  });

  it('is the headless shell when it is the only one', () => {
    expect(hiddenBrowser({ forTesting: () => [], shells: () => [SHELL] })).toBe(SHELL);
  });

  it('is Chrome for Testing only when there is no headless shell', () => {
    expect(hiddenBrowser({ forTesting: () => [CFT], shells: () => [] })).toBe(CFT);
  });

  it('is none when neither is installed', () => {
    expect(hiddenBrowser({ forTesting: () => [], shells: () => [] })).toBe(null);
  });
});

describe.skipIf(!cdp)('the browser a test drive starts on a Mac', () => {
  it('is the headless shell when Chrome for Testing is installed beside it', () => {
    expect(cdp.findChrome('darwin', {}, undefined, () => [CFT], () => [SHELL])).toBe(SHELL);
  });

  it('is Chrome for Testing when VERIFY_CHROME names it', () => {
    expect(cdp.findChrome('darwin', { VERIFY_CHROME: CFT }, undefined, () => [CFT], () => [SHELL])).toBe(CFT);
  });

  it('is Chrome for Testing only when there is no headless shell', () => {
    expect(cdp.findChrome('darwin', {}, undefined, () => [CFT], () => [])).toBe(CFT);
  });
});
