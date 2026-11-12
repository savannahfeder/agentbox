// For days a Mac showed "Google Chrome for Testing wants to use your
// confidential information stored in Chromium Safe Storage" over and over.
// Allow, Deny or the password: the next hidden browser an agent or a tester
// started asked again. Every launch passed its own flags and none of them
// told Chrome to keep off the login keychain (Playwright adds
// --use-mock-keychain by itself; our own spawns did not). Measured by reading
// the arguments each launch site passes.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { KEEPS_OFF_THE_KEYCHAIN } from '../shared/hidden-browser.mts';
import { launchChrome } from '../.claude/skills/verify-agentbox/scripts/cdp.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const SKIP = new Set(['node_modules', '.git', 'tests', 'dist', 'out', 'release']);

function sources(dir: string, found: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name) || e.name === 'scratch') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sources(p, found);
    else if (/\.(mts|mjs|ts|js|cjs)$/.test(e.name)) found.push(p);
  }
  return found;
}

describe('the hidden browser never asks for the keychain password', () => {
  it('names the flags that keep Chrome off the login keychain', () => {
    expect(KEEPS_OFF_THE_KEYCHAIN).toEqual(['--use-mock-keychain', '--password-store=basic']);
  });

  it('the tester browser is started with them', async () => {
    let args: string[] = [];
    const start = (_bin: string, a: string[]) => {
      args = a;
      const child = Object.assign(new EventEmitter(), { stderr: new EventEmitter(), kill() {}, unref() {} });
      setImmediate(() => child.stderr.emit('data', 'DevTools listening on ws://127.0.0.1:1/devtools/browser/x\n'));
      return child;
    };
    await launchChrome({ bin: process.execPath, profile: '/tmp/unused', platform: 'linux', start });
    for (const flag of KEEPS_OFF_THE_KEYCHAIN) expect(args).toContain(flag);
  });

  it('every file that starts a headless browser of its own passes them', () => {
    const launchers = sources(ROOT).filter((f) => fs.readFileSync(f, 'utf8').includes("'--headless=new'"));
    expect(launchers.length).toBeGreaterThanOrEqual(7);
    const missing = launchers
      .filter((f) => !fs.readFileSync(f, 'utf8').includes('...KEEPS_OFF_THE_KEYCHAIN'))
      .map((f) => path.relative(ROOT, f));
    expect(missing).toEqual([]);
  });

  it('a file that only opens the app with a debugging port is not counted as a browser launch', () => {
    const live = fs.readFileSync(path.join(ROOT, '.claude/skills/verify-agentbox/scripts/live.mjs'), 'utf8');
    expect(live).toContain('--remote-debugging-port');
    expect(live).not.toContain("'--headless=new'");
  });
});
