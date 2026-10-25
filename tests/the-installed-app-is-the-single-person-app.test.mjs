// THE INSTALLED APP IS THE SINGLE-PERSON APP: NO SIGN-IN PAGE, NO KEYCHAIN PROMPT.
//
// Found on 2026-10-06 opening the first signed download from agentbox.ac. Two
// things happened before anything else:
//
//   1. The window opened on "Sign in to Agentbox" (the team version's page).
//      The Mac it ran on keeps a team key at ~/.agentbox/team.config.json, and
//      loadCloudConfig honoured it in an installed build, so the download became
//      the team app. The founder's call: "users are no longer using the
//      multiplayer version so this should never be visible."
//   2. macOS asked for the login keychain password for "Agentbox Safe Storage".
//      main.mjs called safeStorage.isEncryptionAvailable() at every launch, team
//      or not, and on a Mac that touches the keychain. Only the team's saved
//      sign-in uses it.
//
// So an installed build never loads a team key, whatever is on the Mac, and the
// keychain is only reached for when there is a team to keep a sign-in for. A
// checkout (npm run app) still finds the Mac's key, so the team version can
// still be run from source. Since 2026-10-23 a build carries its own cloud for
// the phone, and the team version is an alpha switch
// (tests/multiplayer-is-an-alpha-feature-in-the-installed-app).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCloudConfig, teamConfigOnThisMac } from '../main/team/session.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY = { url: 'https://hers.test', anonKey: 'k' };
const was = process.env.AGENTBOX_TEAM_CONFIG;
beforeEach(() => { delete process.env.AGENTBOX_TEAM_CONFIG; });
afterEach(() => { if (was === undefined) delete process.env.AGENTBOX_TEAM_CONFIG; else process.env.AGENTBOX_TEAM_CONFIG = was; });

function aMac({ inHome, inFolder } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'single-home-'));
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'single-app-'));
  if (inHome) {
    fs.mkdirSync(path.dirname(teamConfigOnThisMac(home)), { recursive: true });
    fs.writeFileSync(teamConfigOnThisMac(home), JSON.stringify(inHome));
  }
  if (inFolder) {
    fs.mkdirSync(path.join(appDir, 'cloud'));
    fs.writeFileSync(path.join(appDir, 'cloud', 'team.config.json'), JSON.stringify(inFolder));
  }
  return { home, appDir };
}

describe('an installed Agentbox', () => {
  it('is the single-person app even when the Mac keeps a team key (the reported case)', () => {
    const { home, appDir } = aMac({ inHome: KEY });
    expect(loadCloudConfig(appDir, { packaged: true, home })).toBeNull();
  });

  it('is the single-person app even with a team key packed beside it', () => {
    const { home, appDir } = aMac({ inFolder: KEY });
    expect(loadCloudConfig(appDir, { packaged: true, home })).toBeNull();
  });

  it('is the single-person app with no key anywhere, as before', () => {
    const { home, appDir } = aMac();
    expect(loadCloudConfig(appDir, { packaged: true, home })).toBeNull();
  });
});

describe('a checkout, run with npm run app', () => {
  it('still runs the team version when the Mac has the key', () => {
    const { home, appDir } = aMac({ inHome: KEY });
    expect(loadCloudConfig(appDir, { packaged: false, home })?.url).toBe('https://hers.test');
  });
});

describe('the keychain', () => {
  // Read off main.mjs because the call is Electron's and cannot run here: every
  // use of safeStorage must sit inside the branch that has a team config.
  it('is only reached for when there is a team to keep a sign-in for', () => {
    const main = fs.readFileSync(path.join(root, 'main', 'main.mjs'), 'utf8');
    const uses = [...main.matchAll(/safeStorage\.\w+/g)].map((m) => m.index);
    expect(uses.length).toBeGreaterThan(0);
    const branch = main.indexOf('const team = cloudConfig ?');
    const end = main.indexOf('}) : null;', branch);
    expect(branch).toBeGreaterThan(-1);
    for (const at of uses) {
      expect(at > branch && at < end, `safeStorage used outside the team branch at ${at}`).toBe(true);
    }
  });
});
