// A TESTER'S PHONE DRAWS A PAGE AT THE IPHONE'S OWN SCALE.
//
// What broke (product loop, 2026-11-17): three testers each reported that
// compare.html showed two of its three designs in a narrow box that would not
// scroll. The phone app was fine. The testers' headless Chrome started at
// --force-device-scale-factor=2 and phone.mjs then emulated an iPhone at 3, and
// Chrome drew the page's iframe at the window's 2, two thirds of its box. A
// measured screenshot: the page filled 575 of 863 pixels at 2, all of them at 3.
import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launchChrome } from '../.claude/skills/verify-agentbox/scripts/cdp.mjs';
import { IPHONE } from '../.claude/skills/product-loop/scripts/phone.mjs';

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

async function scaleOf(opts: { scale?: number }) {
  const seen: string[][] = [];
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-scale-'));
  try {
    await launchChrome({ bin: process.execPath, profile, platform: 'linux', start: fakeChrome(seen), ...opts });
  } finally { fs.rmSync(profile, { recursive: true, force: true }); }
  return seen[0].filter((a) => a.startsWith('--force-device-scale-factor='));
}

describe("a tester's phone", () => {
  it('starts its browser at the scale it asks for', async () => {
    expect(await scaleOf({ scale: 3 })).toEqual(['--force-device-scale-factor=3']);
  });

  it('leaves every other browser at 2', async () => {
    expect(await scaleOf({})).toEqual(['--force-device-scale-factor=2']);
  });

  it('asks for the scale it then emulates', () => {
    const phone = fs.readFileSync(path.join(ROOT, '.claude/skills/product-loop/scripts/phone.mjs'), 'utf8');
    expect(IPHONE.scale).toBe(3);
    expect(phone).toMatch(/launchChrome\(\{[^}]*scale: IPHONE\.scale/);
  });
});
