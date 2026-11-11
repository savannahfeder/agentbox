// A SIGNED-OUT LOGIN IS NOT RETRIED EACH TIME CLAUDE REWRITES ITS SETTINGS.
//
// What broke (2026-11-08): the Mac's Claude login expired ("OAuth session
// expired and could not be refreshed") for about an hour. Threads on it should
// have waited, reading "Signed out", tried once per five-minute rest. Instead
// two threads were started 11 times in 41 minutes, at gaps of 38 and 67
// seconds, and threads were held one after another with "Agentbox stopped
// starting this thread ... each run ended before its agent began".
//
// The cause: a sign-in was "noticed" whenever `.claude.json` changed, and every
// Claude Code session on that login rewrites that file as it runs. Each rewrite
// lifted the login's rest and gave every waiting thread a try. On a Mac the
// login itself lives in the Keychain: its entry for that login changed at
// 8:35:45pm, and runs worked from 8:35:59pm.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';
import { claudeKeychainService } from '../main/sign-in-files.mts';

const REFUSED = 'Failed to authenticate: OAuth session expired and could not be refreshed';
const MIN = 60_000;
const realNow = Date.now;
let now; let root; let folder; let keychain;

function supervisor() {
  const sup = new Supervisor(
    { storeRoot: root, home: root, maxConcurrentSessions: 3, authProfiles: [folder] },
    { listItems: () => [], listProducts: () => [] },
    root, root, root,
  );
  sup._keychainStamp = (service) => keychain[service] ?? null;
  return sup;
}

const touch = (file, at) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, '{}');
  fs.utimesSync(file, at / 1000, at / 1000);
};

// The login is found signed out, and then time passes.
function signedOut(sup) {
  sup._noteProfileTrouble(folder, REFUSED);
  sup._profileCooldown = { [folder]: now + 5 * MIN };
  expect(sup._profileTrouble[folder].cause).toBe('signed-out');
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'signed-out-rewrites-'));
  folder = path.join(root, '.claude-3');
  now = realNow() - 10 * MIN;
  Date.now = () => now;
  touch(path.join(folder, '.claude.json'), now - 60 * MIN);
  keychain = { [claudeKeychainService(folder)]: now - 60 * MIN };
});
afterEach(() => { Date.now = realNow; fs.rmSync(root, { recursive: true, force: true }); });

describe('a Claude login kept in the Keychain', () => {
  it('stays resting while other Claude sessions rewrite .claude.json', () => {
    const sup = supervisor();
    signedOut(sup);
    let lifts = 0;
    for (let i = 0; i < 10; i += 1) {
      now += 40_000;
      touch(path.join(folder, '.claude.json'), now);
      if (sup._noticeSignIns()) lifts += 1;
    }
    expect(lifts).toBe(0);
    expect(sup._profileCooldown[folder]).toBeGreaterThan(0);
  });

  it('comes back on the first tick after its Keychain entry changes', () => {
    const sup = supervisor();
    signedOut(sup);
    now += MIN;
    keychain[claudeKeychainService(folder)] = now;
    expect(sup._noticeSignIns()).toBe(true);
    expect(sup._profileCooldown[folder]).toBe(0);
    // One sign-in buys one lift.
    now += 15_000;
    expect(sup._noticeSignIns()).toBe(false);
  });

  it('does not come back for a Keychain entry no newer than when it was found out', () => {
    const sup = supervisor();
    keychain[claudeKeychainService(folder)] = now;
    signedOut(sup);
    now += MIN;
    expect(sup._noticeSignIns()).toBe(false);
    keychain[claudeKeychainService(folder)] = now - MIN + 1000;
    expect(sup._noticeSignIns()).toBe(true);
  });

  it('comes back when Claude writes its sign-in to .credentials.json instead', () => {
    const sup = supervisor();
    signedOut(sup);
    now += MIN;
    touch(path.join(folder, '.credentials.json'), now);
    expect(sup._noticeSignIns()).toBe(true);
  });
});

// THE CASE THAT MUST NOT CHANGE: no Keychain entry (Linux, or a login that keeps
// its sign-in in files), so the files are all there is to watch.
describe('a Claude login with no Keychain entry', () => {
  it('still comes back when its login file is rewritten', () => {
    keychain = {};
    const sup = supervisor();
    signedOut(sup);
    now += MIN;
    touch(path.join(folder, '.claude.json'), now);
    expect(sup._noticeSignIns()).toBe(true);
  });
});

describe('reading the Keychain entry', () => {
  it('names the entry the way Claude Code does', () => {
    expect(claudeKeychainService(null)).toBe('Claude Code-credentials');
    expect(claudeKeychainService('/Users/someone/.claude-3')).toMatch(/^Claude Code-credentials-[0-9a-f]{8}$/);
  });

  // Reading the entry's date: tests/the-app-never-waits-on-the-keychain-to-look-for-a-sign-in.
});
