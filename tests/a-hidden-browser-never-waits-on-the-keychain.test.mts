// A HIDDEN BROWSER NEVER WAITS ON THE KEYCHAIN.
//
// What broke (w-c07d8993c4, 2026-11-09): Playwright's Chrome for Testing was
// installed on a Mac at 8:13pm, and from then on every power-test tester, in
// three threads, timed out on its first look. The browser started and loaded a
// data: page, but Page.navigate to any http://127.0.0.1 page, even a bare
// python http.server, never returned. A new Chrome asks the Keychain for its
// cookie password before its first network request, and a headless one has
// nowhere to show that prompt. With --use-mock-keychain the same page loaded
// in about a second. The headless shell, used before Chrome for Testing was
// installed, never asked.
import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launchChrome } from '../.claude/skills/verify-agentbox/scripts/cdp.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');

function fakeChrome(seen: string[][]) {
  return (_bin: string, args: string[]) => {
    seen.push(args);
    const child = Object.assign(new EventEmitter(), { stderr: new EventEmitter(), pid: 1, kill: () => true, unref: () => {} });
    Object.assign(child.stderr, { destroy: () => {} });
    setImmediate(() => child.stderr.emit('data', 'DevTools listening on ws://127.0.0.1:1/devtools/browser/x\n'));
    return child;
  };
}

describe('a hidden browser', () => {
  it('starts with the mock keychain in a drive', async () => {
    const seen: string[][] = [];
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mock-keychain-'));
    try {
      await launchChrome({ bin: process.execPath, profile, platform: 'linux', start: fakeChrome(seen) });
    } finally { fs.rmSync(profile, { recursive: true, force: true }); }
    expect(seen[0]).toContain('--use-mock-keychain');
  });

  it('starts with the mock keychain wherever this repository starts one headless', () => {
    const files = execFileSync('git', ['grep', '-l', '-e', "'--headless=new'", '--', '*.mjs', '*.mts', ':!tests/'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n').filter(Boolean);
    expect(files.length).toBeGreaterThan(2);
    // shared/hidden-browser.mts KEEPS_OFF_THE_KEYCHAIN carries the flag.
    const without = files.filter((f) => !/'--use-mock-keychain'|\.\.\.KEEPS_OFF_THE_KEYCHAIN/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
    expect(without).toEqual([]);
  });
});
