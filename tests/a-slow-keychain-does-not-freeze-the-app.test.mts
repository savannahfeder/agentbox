// A SLOW KEYCHAIN DOES NOT FREEZE THE APP.
//
// What broke (2026-11-09): the freeze recorder caught the main thread held 530
// times, 6689.6 s in all and 946 s at the longest, inside keychainStamp. Every
// 15-second tick, for each signed-out Claude login, the app ran
// `security find-generic-password` and waited for it with execFileSync. On a
// Mac swapping 160 MB/s that wait ran far past its own 3 s timeout.
//
// Measured: a read that never answers used to block the tick; now the tick
// returns at once, starts one read per entry, and uses the answer on the next
// tick once it lands.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';

const REFUSED = 'Failed to authenticate: OAuth session expired and could not be refreshed';
const MIN = 60_000;
const realNow = Date.now;
let now; let root; let folder;

function supervisor() {
  return new Supervisor(
    { storeRoot: root, home: root, maxConcurrentSessions: 3, authProfiles: [folder] },
    { listItems: () => [], listProducts: () => [] },
    root, root, root,
  );
}

function slowKeychain(sup) {
  const asks = [];
  sup._keychainPlatform = 'darwin';
  sup._keychainRead = (service) => new Promise((resolve) => { asks.push({ service, resolve }); });
  return asks;
}

const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'slow-keychain-'));
  folder = path.join(root, '.claude-3');
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, '.claude.json'), '{}');
  now = realNow() - 10 * MIN;
  Date.now = () => now;
});
afterEach(() => { Date.now = realNow; fs.rmSync(root, { recursive: true, force: true }); });

describe('looking for a sign-in while the Keychain is slow', () => {
  it('does not wait for the Keychain, and asks it once while a read is out', () => {
    const sup = supervisor();
    const asks = slowKeychain(sup);
    sup._noteProfileTrouble(folder, REFUSED);
    expect(sup._noticeSignIns()).toBe(false);
    expect(sup._noticeSignIns()).toBe(false);
    expect(asks.length).toBe(1);
  });

  it('does not take a rewritten .claude.json for a sign-in before the Keychain answers', () => {
    const sup = supervisor();
    slowKeychain(sup);
    sup._noteProfileTrouble(folder, REFUSED);
    now += MIN;
    fs.utimesSync(path.join(folder, '.claude.json'), now / 1000, now / 1000);
    expect(sup._noticeSignIns()).toBe(false);
  });

  it('lifts the login on the tick after the Keychain says it changed', async () => {
    const sup = supervisor();
    const asks = slowKeychain(sup);
    sup._noteProfileTrouble(folder, REFUSED);
    now += MIN;
    sup._noticeSignIns();
    asks[0].resolve(now);
    await settle();
    expect(sup._noticeSignIns()).toBe(true);
  });

  it('does not lift the login on an entry older than the sign-out', async () => {
    const sup = supervisor();
    const asks = slowKeychain(sup);
    sup._noteProfileTrouble(folder, REFUSED);
    asks[0].resolve(now - 60 * MIN);
    await settle();
    now += MIN;
    expect(sup._noticeSignIns()).toBe(false);
  });

  it('never waits on `security` in the code that reads it', () => {
    const src = fs.readFileSync(new URL('../main/sign-in-files.mts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/execFileSync|spawnSync/);
  });
});
