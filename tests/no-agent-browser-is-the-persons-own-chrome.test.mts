// NO AGENT BROWSER IS THE PERSON'S OWN CHROME.
//
// What broke (w-4ccc480e21, 2026-11-08, the second time that day): Chrome
// opened no window "almost every time". A headless copy of /Applications/Google
// Chrome.app registers with the Mac as com.google.Chrome, and the Dock, ⌘N and
// `open` all hand the person's click to it. The first fix covered only the
// verify drives; the screenshot scripts, the inbox harness and the worker's
// look-at-page tool each named Google Chrome themselves. One leftover, alive
// 1 h 46 m, came from a test that called launchChrome before the refusal
// existed, so a red-first run started a real Chrome. Now one module picks the
// browser, nothing else names Google Chrome's binary, and the refusal is tested
// with a spawn that throws.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { MAC_CHROME, hiddenBrowser, startableChrome } from '../shared/hidden-browser.mts';
import { launchChrome } from '../.claude/skills/verify-agentbox/scripts/cdp.mjs';
import { browsersToTry } from '../mcp/core/page.mts';

const ROOT = path.resolve(import.meta.dirname, '..');
const SKIP = new Set(['node_modules', '.git', 'tests', 'dist', 'scratch', 'worktrees', 'out', 'release']);

function sources(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sources(p, out);
    else if (/\.(mjs|mts|js|cjs|ts)$/.test(e.name)) out.push(p);
  }
  return out;
}

describe('which code may name Google Chrome as a browser to start', () => {
  const files = [...sources(path.join(ROOT, 'scripts')), ...sources(path.join(ROOT, 'mcp')), ...sources(path.join(ROOT, 'main')),
    ...sources(path.join(ROOT, 'shared')), ...sources(path.join(ROOT, '.claude/skills'))];

  it('is only the module that picks the hidden browser', () => {
    const naming = files.filter((f) => fs.readFileSync(f, 'utf8').includes('Google Chrome.app/Contents/MacOS/Google Chrome'));
    expect(naming.map((f) => path.relative(ROOT, f))).toEqual(['shared/hidden-browser.mts']);
  });

  it('includes no Playwright launch on the installed Chrome', () => {
    const channel = files.filter((f) => /channel:\s*['"]chrome['"]/.test(fs.readFileSync(f, 'utf8')));
    expect(channel.map((f) => path.relative(ROOT, f))).toEqual([]);
  });
});

describe('the browser a script starts on a Mac', () => {
  it('is the hidden one when there is one', () => {
    expect(startableChrome({ platform: 'darwin', env: {}, hidden: () => '/cache/chrome-headless-shell' })).toBe('/cache/chrome-headless-shell');
  });

  it('is refused, with what to install, when there is none', () => {
    expect(() => startableChrome({ platform: 'darwin', env: {}, hidden: () => null })).toThrow(/npx playwright install chromium-headless-shell/);
  });

  it('is never Google Chrome, even when CHROME names it', () => {
    expect(() => startableChrome({ platform: 'darwin', env: { CHROME: MAC_CHROME }, hidden: () => null })).toThrow(/stop your own Chrome/);
  });

  it('is whatever CHROME names on Linux', () => {
    expect(startableChrome({ platform: 'linux', env: { CHROME: '/usr/bin/chromium' }, hidden: () => null })).toBe('/usr/bin/chromium');
  });

  it('prefers Chrome for Testing to the headless shell', () => {
    expect(hiddenBrowser({ forTesting: () => ['/cft'], shells: () => ['/shell'] })).toBe('/cft');
    expect(hiddenBrowser({ forTesting: () => [], shells: () => ['/shell'] })).toBe('/shell');
    expect(hiddenBrowser({ forTesting: () => [], shells: () => [] })).toBe(null);
  });
});

describe('the verify drive refusing Google Chrome', () => {
  it('starts nothing at all', async () => {
    let started = 0;
    const start = () => { started += 1; throw new Error('a browser was started'); };
    await expect(launchChrome({ bin: MAC_CHROME, profile: '/nowhere', platform: 'darwin', start }))
      .rejects.toThrow(/npx playwright install chromium-headless-shell/);
    expect(started).toBe(0);
  });
});

describe('the page a worker looks at', () => {
  it('opens in the hidden browser before any installed one, and in Google Chrome last', () => {
    const tried = browsersToTry({ hidden: () => '/cache/chrome-headless-shell' });
    expect(tried[0]).toBe('/cache/chrome-headless-shell');
    expect(tried.at(-1)).toBe(MAC_CHROME);
    expect(browsersToTry({ hidden: () => null })[0]).not.toBe(MAC_CHROME);
  });
});
