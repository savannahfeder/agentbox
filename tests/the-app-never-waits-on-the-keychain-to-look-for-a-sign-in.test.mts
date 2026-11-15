// THE APP NEVER WAITS ON THE KEYCHAIN TO LOOK FOR A SIGN-IN.
//
// What broke (2026-11-09): "using agentbox is VERY painful because everything
// has a 300ms lag". The freeze log held the main process in `keychainStamp`
// 467 times that day, median 797 ms, p90 2 s, about 5,600 s in all, more than
// every other cause together. Every supervisor pass ran `security
// find-generic-password` synchronously for each signed-out Claude login, and a
// pass runs up to once a second while agents are busy. One login had been
// signed out since 2026-09-06; the lookup timed at 0.32 s on the Mac, which is
// the 300 ms she felt on every click.
//
// Now the lookup runs in the background, at most once every ten seconds per
// entry, and a pass reads the last answer. Until the first answer is in, a
// pass says nothing about a sign-in, rather than guessing from `.claude.json`.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';
import { claudeKeychainService, KeychainStamps, keychainStampLater } from '../main/sign-in-files.mts';

const REFUSED = 'Failed to authenticate: OAuth session expired and could not be refreshed';
const MIN = 60_000;
const realNow = Date.now;
let now; let root; let folder; let service;

// A Keychain whose answers arrive only when the test says so.
function slowKeychain(entries) {
  const asked = [];
  const pending = [];
  const read = (svc, done) => { asked.push(svc); pending.push(() => done(entries[svc] ?? null)); };
  const answer = () => { while (pending.length) pending.shift()(); };
  return { asked, read, answer };
}

function supervisor(keychain) {
  const sup = new Supervisor(
    { storeRoot: root, home: root, maxConcurrentSessions: 3, authProfiles: [folder] },
    { listItems: () => [], listProducts: () => [] },
    root, root, root,
  );
  sup._keychainStamps = new KeychainStamps(keychain.read, 10_000, () => now);
  return sup;
}

const touch = (file, at) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, '{}');
  fs.utimesSync(file, at / 1000, at / 1000);
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'keychain-later-'));
  folder = path.join(root, '.claude-3');
  service = claudeKeychainService(folder);
  now = realNow() - 10 * MIN;
  Date.now = () => now;
  touch(path.join(folder, '.claude.json'), now - 60 * MIN);
});
afterEach(() => { Date.now = realNow; fs.rmSync(root, { recursive: true, force: true }); });

describe('looking for a sign-in on each pass', () => {
  it('asks the Keychain at most once every ten seconds, however often the pass runs', () => {
    const keychain = slowKeychain({ [service]: now - 60 * MIN });
    const sup = supervisor(keychain);
    sup._noteProfileTrouble(folder, REFUSED);
    for (let i = 0; i < 30; i += 1) { now += 1000; sup._noticeSignIns(); keychain.answer(); }
    expect(keychain.asked.length).toBeGreaterThanOrEqual(3);
    expect(keychain.asked.length).toBeLessThanOrEqual(4);
  });

  it('does not ask again while the last question is still out', () => {
    const keychain = slowKeychain({ [service]: now });
    const stamps = new KeychainStamps(keychain.read, 10_000, () => now);
    expect(stamps.get(service)).toBe(undefined);
    now += 60_000;
    expect(stamps.get(service)).toBe(undefined);
    expect(keychain.asked.length).toBe(1);
    keychain.answer();
    expect(stamps.get(service)).toBe(now - 60_000);
  });

  it('does not lift the login before the Keychain has answered, whatever .claude.json says', () => {
    const keychain = slowKeychain({ [service]: now - 60 * MIN });
    const sup = supervisor(keychain);
    sup._noteProfileTrouble(folder, REFUSED);
    now += 1000;
    touch(path.join(folder, '.claude.json'), now);
    expect(sup._noticeSignIns()).toBe(false);
  });

  it('does not lift for an entry older than when the login was found out, once it is read', () => {
    const keychain = slowKeychain({ [service]: now - 60 * MIN });
    const sup = supervisor(keychain);
    sup._noteProfileTrouble(folder, REFUSED);
    keychain.answer();
    now += 15_000;
    expect(sup._noticeSignIns()).toBe(false);
    keychain.answer();
    now += 15_000;
    expect(sup._noticeSignIns()).toBe(false);
  });

  it('lifts on the pass after a sign-in lands in the Keychain', () => {
    const entries = { [service]: now - 60 * MIN };
    const keychain = slowKeychain(entries);
    const sup = supervisor(keychain);
    sup._noteProfileTrouble(folder, REFUSED);
    sup._profileCooldown = { [folder]: now + 5 * MIN };
    keychain.answer();
    now += MIN;
    entries[service] = now;
    sup._noticeSignIns();
    keychain.answer();
    now += 1000;
    expect(sup._noticeSignIns()).toBe(true);
    expect(sup._profileCooldown[folder]).toBe(0);
  });

  it('still watches the files when the Keychain has no entry for the login', () => {
    const keychain = slowKeychain({});
    const sup = supervisor(keychain);
    sup._noteProfileTrouble(folder, REFUSED);
    keychain.answer();
    now += MIN;
    touch(path.join(folder, '.claude.json'), now);
    expect(sup._noticeSignIns()).toBe(true);
  });
});

describe('the background lookup', () => {
  it('reads only the date the entry last changed, and never blocks', () => {
    const out = '    "mdat"<timedate>=0x32303236313130393034333534355A00  "20261109043545Z\\000"\n';
    let asked; let got;
    keychainStampLater('Claude Code-credentials', (at) => { got = at; }, (cmd, args, opts, done) => { asked = args; done(null, out); }, 'darwin');
    expect(got).toBe(Date.UTC(2026, 10, 9, 4, 35, 45));
    expect(asked).not.toContain('-w');
    expect(asked).not.toContain('-g');
  });

  it('is nothing when there is no entry, or off a Mac', () => {
    let a = 'unset'; let b = 'unset';
    keychainStampLater('x', (at) => { a = at; }, (cmd, args, opts, done) => done(new Error('exit 44'), ''), 'darwin');
    keychainStampLater('x', (at) => { b = at; }, () => { throw new Error('never asked'); }, 'linux');
    expect(a).toBe(null);
    expect(b).toBe(null);
  });
});
