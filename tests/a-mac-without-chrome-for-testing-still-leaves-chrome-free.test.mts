// A MAC WITHOUT CHROME FOR TESTING STILL LEAVES CHROME FREE TO OPEN.
//
// What broke (w-4ccc480e21, 2026-11-08): the day after the Chrome for Testing
// fix, Chrome again opened no window, through force quits and ⌘N. `lsappinfo
// list` showed four headless copies of /Applications/Google Chrome.app as
// com.google.Chrome (BackgroundOnly), all started by verify and power-test
// drives. This Mac had only Playwright's chrome-headless-shell in its cache, no
// Chrome for Testing, so findChrome fell back to the person's own Chrome. The
// headless shell is a bare binary: started with the drive's flags, `lsappinfo
// info` gives it no bundle id, so it never takes a Chrome click.
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { canDrive, findChrome, headlessShells, launchChrome } from '../.claude/skills/verify-agentbox/scripts/cdp.mjs';
import { isOurChrome } from '../scripts/lib/chrome-guard.mjs';
import { MAC_CHROME as MAC } from '../shared/hidden-browser.mts';

const SHELL = 'chrome-headless-shell';
const roots = [];
// Before the refusal existed, a red run of these tests started a real headless Chrome that outlived it.
const noBrowser = () => { throw new Error('a browser was started'); };
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

describe('the hidden browser on a Mac with no Chrome for Testing', () => {
  it('is the headless shell when Playwright installed it', () => {
    const shell = `/cache/chromium_headless_shell-1254/chrome-headless-shell-mac-arm64/${SHELL}`;
    expect(findChrome('darwin', {}, undefined, () => [], () => [shell])).toBe(shell);
  });

  it('is still Chrome for Testing when both are installed', () => {
    const cft = '/cache/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
    expect(findChrome('darwin', {}, undefined, () => [cft], () => ['/cache/shell'])).toBe(cft);
  });

  it('is not the headless shell on Linux', () => {
    expect(findChrome('linux', { VERIFY_CHROME: '/usr/bin/chromium' }, undefined, () => [], () => ['/x'])).toBe('/usr/bin/chromium');
  });
});

describe('finding the headless shell in the Playwright cache', () => {
  it('lists the newest build first, on Apple silicon and Intel', () => {
    const root = cache([
      `chromium_headless_shell-1200/chrome-headless-shell-mac-x64/${SHELL}`,
      `chromium_headless_shell-1254/chrome-headless-shell-mac-arm64/${SHELL}`,
    ]);
    expect(headlessShells(root)).toEqual([
      path.join(root, `chromium_headless_shell-1254/chrome-headless-shell-mac-arm64/${SHELL}`),
      path.join(root, `chromium_headless_shell-1200/chrome-headless-shell-mac-x64/${SHELL}`),
    ]);
  });

  it('skips a half-installed build and a full Chromium folder', () => {
    const root = cache([
      'chromium_headless_shell-1300/chrome-headless-shell-mac-arm64/ABOUT',
      `chromium-1400/chrome-headless-shell-mac-arm64/${SHELL}`,
    ]);
    expect(headlessShells(root)).toEqual([]);
  });

  it('is empty when there is no cache at all', () => {
    expect(headlessShells('/nowhere/at/all')).toEqual([]);
  });
});

describe('starting a hidden drive', () => {
  it('refuses the person\'s own Chrome on a Mac and says what to install', async () => {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'refused-'));
    roots.push(profile);
    await expect(launchChrome({ bin: MAC, profile, platform: 'darwin', start: noBrowser }))
      .rejects.toThrow(/npx playwright install chromium-headless-shell/);
  });

  it('does not refuse a test browser on a Mac', async () => {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'refused-'));
    roots.push(profile);
    await expect(launchChrome({ bin: '/nowhere/chrome-headless-shell', profile, platform: 'darwin', start: noBrowser }))
      .rejects.toThrow(/No browser at \/nowhere/);
  });
});

// A Mac runner with Google Chrome and no Playwright browser (GitHub's macOS
// image) used to run the real-browser tests, which then hit this refusal and
// failed main. They skip on what launchChrome would refuse.
describe('whether a browser can be driven here', () => {
  it('is no for the person\'s own Chrome on a Mac', () => {
    expect(canDrive(MAC, 'darwin', () => true)).toBe(false);
  });

  it('is yes for a test browser on a Mac', () => {
    expect(canDrive(`/cache/chromium_headless_shell-1254/chrome-headless-shell-mac-arm64/${SHELL}`, 'darwin', () => true)).toBe(true);
  });

  it('is yes for Google Chrome on Linux, where nothing takes its clicks', () => {
    expect(canDrive(MAC, 'linux', () => true)).toBe(true);
  });

  it('is no for a browser that is not installed', () => {
    expect(canDrive('/usr/bin/chromium', 'linux', () => false)).toBe(false);
  });
});

describe('the orphan sweep', () => {
  it('knows a headless shell on a throwaway profile is ours', () => {
    const shell = `/Users/x/Library/Caches/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-mac-arm64/${SHELL}`;
    expect(isOurChrome({ pid: 1, ppid: 1, command: `${shell} --headless=new --user-data-dir=/tmp/shot-profile-abc about:blank` })).toBe(true);
  });

  it('leaves a headless shell on any other profile alone', () => {
    const shell = `/opt/pw/chromium_headless_shell-1254/chrome-headless-shell-mac-arm64/${SHELL}`;
    expect(isOurChrome({ pid: 1, ppid: 1, command: `${shell} --user-data-dir=/Users/x/profile about:blank` })).toBe(false);
  });
});
