// 2026-11-07: `npm run deploy` stopped at notarising with "No Keychain password
// item found for profile: agentbox-notary", after six releases that used the
// same saved profile. The system log showed why: the deploy's own check read
// the profile at 14:30, the screen was locked at 14:36, and the build's read at
// 14:39 failed. `notarytool store-credentials` with no --keychain saves to the
// data-protection keychain, which macOS closes while the screen is locked. A
// profile saved in a keychain file was read with the screen locked (Apple
// answered the request), while the default one still said "not found".
//
// So the deploy saves the profile in the login keychain file and every
// notarytool call reads it from there.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const deploy = fs.readFileSync(path.join(root, 'scripts/deploy.mjs'), 'utf8');
const release = fs.readFileSync(path.join(root, 'scripts/release.mjs'), 'utf8');

const notarytoolCalls = (src) => src.split('\n').filter((l) => /'notarytool', '(history|store-credentials|submit)'/.test(l));

describe('a deploy keeps the Apple login where a locked screen can still read it', () => {
  it('names the login keychain file', () => {
    expect(deploy).toMatch(/NOTARY_KEYCHAIN = path\.join\(os\.homedir\(\), 'Library', 'Keychains', 'login\.keychain-db'\)/);
  });

  it('checks for the profile in that file, and saves it there when it is missing', () => {
    const calls = notarytoolCalls(deploy);
    expect(calls.some((l) => l.includes("'history'"))).toBe(true);
    expect(calls.some((l) => l.includes("'store-credentials'"))).toBe(true);
    for (const l of calls) expect(l).toMatch(/'--keychain', NOTARY_KEYCHAIN/);
  });

  it('hands the same file to the build, which notarises the app with it', () => {
    expect(deploy).toMatch(/APPLE_KEYCHAIN: NOTARY_KEYCHAIN/);
    expect(deploy).toMatch(/APPLE_KEYCHAIN_PROFILE: NOTARY_PROFILE/);
  });

  it('never saves it to iCloud, which a locked screen closes too', () => {
    expect(deploy).not.toMatch(/'--sync'/);
  });
});

describe('the release notarises the dmg from the same file', () => {
  it('passes --keychain when it was given one', () => {
    expect(release).toMatch(/process\.env\.APPLE_KEYCHAIN\b/);
    expect(release).toMatch(/\.\.\.\(keychain \? \['--keychain', keychain\] : \[\]\)/);
  });

  it('still works with only a profile, for npm run release by hand', () => {
    expect(release).toMatch(/\? \['--keychain-profile', profile, \.\.\.\(keychain/);
  });
});
