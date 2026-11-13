// A TEST BROWSER CAN BE NAMED ON A MAC TOO (w-fbe5e95dea, 2026-11-10).
//
// Mid-run, every new Chrome for Testing on this Mac stopped reaching local
// pages: a plain page served by python on 127.0.0.1 never loaded, while
// Playwright's headless shell loaded the app in 0.3 s. On a Mac, findChrome
// always took Chrome for Testing and ignored VERIFY_CHROME, so two synthetic
// testers sat an hour in front of a page that never came. VERIFY_CHROME now
// names the browser on a Mac as it does on Linux, never the person's own Chrome.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findChrome } from '../.claude/skills/verify-agentbox/scripts/cdp.mjs';

const MAC = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHELL = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'named-browser-')), 'chrome-headless-shell');
fs.writeFileSync(SHELL, '');
const CFT = '/cache/chromium-1254/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

describe('the browser a hidden drive starts on a Mac', () => {
  it('is the one VERIFY_CHROME names', () => {
    expect(findChrome('darwin', { VERIFY_CHROME: SHELL }, undefined, () => [CFT], () => [SHELL])).toBe(SHELL);
  });
  it('is Chrome for Testing when nothing is named', () => {
    expect(findChrome('darwin', {}, undefined, () => [CFT], () => [SHELL])).toBe(CFT);
  });
  it('is not a name with nothing on disk behind it', () => {
    expect(findChrome('darwin', { VERIFY_CHROME: '/opt/nothing-here' }, undefined, () => [CFT], () => [SHELL])).toBe(CFT);
  });
  it("is never the person's own Chrome, even when named", () => {
    expect(findChrome('darwin', { VERIFY_CHROME: MAC }, undefined, () => [CFT], () => [SHELL])).toBe(CFT);
  });
});
