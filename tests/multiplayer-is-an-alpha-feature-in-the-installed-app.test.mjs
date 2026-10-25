// MULTIPLAYER IS AN ALPHA FEATURE IN THE INSTALLED APP, AND THE PHONE SIGN-IN IS FOR EVERYONE.
//
// Since 2026-10-06 an installed build never loaded the team cloud
// (tests/the-installed-app-is-the-single-person-app), so nobody running the
// download could sign in, and the phone app reads and replies only through
// a computer that is signed in. On 2026-10-23, with the phone app going to
// TestFlight, the founder said multiplayer "can actually be usable as just an
// alpha feature".
//
// So an installed build carries its own team cloud, baked in at release (never
// a key read off the Mac or the environment). Settings › Phone signs in to it.
// The team version itself (the sign-in page over the app, the Team page, the
// teammates) shows only while Settings › Alpha features › Multiplayer is on;
// a checkout keeps the team version unless it is switched off.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadCloudConfig, teamConfigOnThisMac } from '../main/team/session.mjs';
import { alphaFeatures, setWorkspaceSetting } from '../main/settings.mjs';
import { teamForWindow } from '../main/team/index.mjs';

const read = (rel) => fs.readFileSync(path.join(import.meta.dirname, '..', rel), 'utf8');
const BAKED = { url: 'https://ours.test', anonKey: 'k', phoneSite: 'https://phone.test' };

function aMac({ baked, inHome, inFolder } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-home-'));
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-app-'));
  fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({ name: 'agentbox-app', ...(baked ? { bakedTeam: baked } : {}) }));
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

describe('the cloud an installed build signs in to', () => {
  it('is the one baked into it at release', () => {
    const { home, appDir } = aMac({ baked: BAKED });
    expect(loadCloudConfig(appDir, { packaged: true, home, env: {} })).toEqual(BAKED);
  });

  it('is never a key on the Mac, in the folder or named by the environment', () => {
    const other = { url: 'https://theirs.test', anonKey: 'x' };
    const { home, appDir } = aMac({ baked: BAKED, inHome: other, inFolder: other });
    const file = path.join(home, 'env.json');
    fs.writeFileSync(file, JSON.stringify(other));
    expect(loadCloudConfig(appDir, { packaged: true, home, env: { AGENTBOX_TEAM_CONFIG: file } })?.url).toBe('https://ours.test');
  });

  it('is none when the build has none baked in, or only half of one', () => {
    expect(loadCloudConfig(aMac().appDir, { packaged: true, env: {} })).toBeNull();
    expect(loadCloudConfig(aMac({ baked: { url: 'https://ours.test' } }).appDir, { packaged: true, env: {} })).toBeNull();
  });

  it('a phone site that is not https is left out', () => {
    const { appDir } = aMac({ baked: { ...BAKED, phoneSite: 'javascript:alert(1)' } });
    expect(loadCloudConfig(appDir, { packaged: true, env: {} })).toEqual({ url: BAKED.url, anonKey: BAKED.anonKey });
  });

  it('a release bakes the team cloud in beside Agentbox Cloud', () => {
    const release = read('scripts/release.mjs');
    expect(release).toMatch(/bakedTeam\.\$\{k\}=/);
    expect(release).toMatch(/loadCloudConfig\(repo, \{ packaged: false/);
  });
});

describe('the Multiplayer switch', () => {
  it('is off in an installed build until someone turns it on', () => {
    expect(alphaFeatures({}, { packaged: true }).multiplayer).toBe(false);
    expect(alphaFeatures({ alphaMultiplayer: true }, { packaged: true }).multiplayer).toBe(true);
    expect(alphaFeatures({ alphaMultiplayer: 'yes' }, { packaged: true }).multiplayer).toBe(false);
  });

  it('is on in a checkout until someone turns it off', () => {
    expect(alphaFeatures({}, { packaged: false }).multiplayer).toBe(true);
    expect(alphaFeatures({ alphaMultiplayer: false }, { packaged: false }).multiplayer).toBe(false);
  });

  it('is saved to the config file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-cfg-'));
    const w = { config: { appDir: dir }, supervisor: { onChange() {} }, store: {} };
    setWorkspaceSetting(w, { key: 'alphaMultiplayer', value: true });
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'zero.config.json'), 'utf8')).alphaMultiplayer).toBe(true);
    expect(alphaFeatures(w.config, { packaged: true }).multiplayer).toBe(true);
  });

  it('has a switch on the Alpha features page', () => {
    expect(read('renderer/src/components/Settings.tsx')).toMatch(/setWorkspace\('alphaMultiplayer'/);
  });
});

describe('what the window is told about the team', () => {
  const state = {
    configured: true, started: true, signedIn: true, signingIn: null, error: null,
    me: { id: 'p1', email: 'me@example.com', name: 'Me' }, team: { id: 't1', name: 'Astral' },
    invites: [{ id: 'i1' }], sent: [{ id: 's1' }], people: [{ id: 'p2' }], cards: [{ id: 'c1' }],
    lastSyncAt: 1, phoneSite: 'https://phone.test', phoneSiteQr: 'data:', rooms: { on: true },
  };

  it('with Multiplayer on, everything, as before', () => {
    expect(teamForWindow(state, true)).toBe(state);
  });

  it('with it off, the sign-in and the phone, and no team', () => {
    const out = teamForWindow(state, false);
    expect(out.configured).toBe(false);
    expect(out).toMatchObject({ started: true, signedIn: true, me: state.me, phoneSite: 'https://phone.test', phoneSiteQr: 'data:' });
    expect(out).toMatchObject({ team: null, invites: [], sent: [], people: [], cards: [] });
    expect(out.rooms).toBeUndefined();
  });

  it('the snapshot and the sign-in answers go through it', () => {
    const ipc = read('main/ipc.mjs');
    expect(ipc).not.toMatch(/team: team\.state\(\)/);
    expect(ipc).toMatch(/team: team \? teamForWindow\(team\.state\(\), alpha\.multiplayer\) : null/);
  });
});

describe('the keychain', () => {
  it('is asked when a sign-in is read or kept, not when the app opens', () => {
    const main = read('main/main.mjs');
    expect(main).not.toMatch(/\.\.\.\(safeStorage\.isEncryptionAvailable\(\)/);
    const calls = [...main.matchAll(/safeStorage\.isEncryptionAvailable\(\)/g)];
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(main.slice(c.index - 30, c.index)).toMatch(/(encrypt|decrypt): \((text|buf)\) => \($/);
  });
});

describe('Settings › Phone', () => {
  it('offers a sign-in of its own that can be closed', () => {
    const settings = read('renderer/src/components/Settings.tsx');
    expect(settings).toMatch(/onPhoneSignIn/);
    const app = read('renderer/src/App.tsx');
    expect(app).toMatch(/<SignInPage purpose="phone"/);
  });
});
