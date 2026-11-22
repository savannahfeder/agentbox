// A COPY FROM GITHUB SIGNS IN TO THE TEAM THAT SHIPS (w-d86031541d, 2026-11-22).
//
// A teammate on Multiplayer was told the app is open source and could
// contribute from a fork. Measured on loadCloudConfig that day: a clean
// checkout with no cloud/team.config.json and none in the home folder came
// back null, so the fork, the npm `agentbox` command and the Linux install
// all ran as the single-person app with no team sign-in, while the Mac
// download signed in. The address and key are public and already ship in
// shared/cloud-address.mts, so a checkout with no file of its own now uses them.
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadCloudConfig, supabaseSession, DEMO_CLOUD } from '../main/team/session.mts';
import { CLOUD_ADDRESS, PHONE_SITE } from '../shared/cloud-address.mts';
import { FRESH_USER_ENV } from '../shared/fresh-user-home.mts';
import { DEMO_ENV } from '../shared/demo-world.mts';

const tmp = (name: string) => fs.mkdtempSync(path.join(os.tmpdir(), `fork-team-${name}-`));
const write = (file: string, value: unknown) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
};

function aFork() {
  const appDir = tmp('app');
  const home = tmp('home');
  write(path.join(appDir, 'package.json'), { name: 'agentbox-app' });
  return { appDir, home };
}

const SHIPPED = { url: CLOUD_ADDRESS.supabaseUrl, anonKey: CLOUD_ADDRESS.anonKey, phoneSite: PHONE_SITE };

afterEach(() => { vi.unstubAllGlobals(); });

describe('a checkout with no team file anywhere', () => {
  it('signs in to the team that ships, phone site included', () => {
    const { appDir, home } = aFork();
    expect(loadCloudConfig(appDir, { packaged: false, home, env: {} })).toEqual(SHIPPED);
  });

  it('and so does one whose only team file is missing its key', () => {
    const { appDir, home } = aFork();
    write(path.join(appDir, 'cloud', 'team.config.json'), { url: 'https://half.test' });
    expect(loadCloudConfig(appDir, { packaged: false, home, env: {} })).toEqual(SHIPPED);
  });

  it('asks the server nothing until someone signs in', async () => {
    const { appDir, home } = aFork();
    const asked: string[] = [];
    vi.stubGlobal('fetch', async (url: unknown) => { asked.push(String(url)); throw new Error('no network in this test'); });
    const session = supabaseSession({
      cloudConfig: loadCloudConfig(appDir, { packaged: false, home, env: {} }),
      sessionFile: path.join(home, '.team-session'),
      openExternal: () => {},
      packaged: false,
      testLogin: null,
    });
    expect(session.configured).toBe(true);
    expect(await session.restore()).toBeNull();
    expect(asked).toEqual([]);
  });
});

describe('a checkout that names its own team', () => {
  it('keeps its own folder’s file', () => {
    const { appDir, home } = aFork();
    write(path.join(appDir, 'cloud', 'team.config.json'), { url: 'https://their-own.test', anonKey: 'k' });
    expect(loadCloudConfig(appDir, { packaged: false, home, env: {} })?.url).toBe('https://their-own.test');
  });

  it('keeps the home folder’s file', () => {
    const { appDir, home } = aFork();
    write(path.join(home, '.agentbox', 'team.config.json'), { url: 'https://home.test', anonKey: 'k' });
    expect(loadCloudConfig(appDir, { packaged: false, home, env: {} })?.url).toBe('https://home.test');
  });
});

describe('copies that still get no team of their own accord', () => {
  it('a fresh test copy handed nothing', () => {
    const { appDir, home } = aFork();
    expect(loadCloudConfig(appDir, { packaged: false, home, env: { [FRESH_USER_ENV]: '1' } })).toBeNull();
  });

  it('a fresh test copy handed a file that is not a team file', () => {
    const { appDir, home } = aFork();
    const handed = path.join(home, 'handed.json');
    write(handed, {});
    expect(loadCloudConfig(appDir, { packaged: false, home, env: { [FRESH_USER_ENV]: '1', AGENTBOX_TEAM_CONFIG: handed } })).toBeNull();
  });

  it('an installed build with no team baked in', () => {
    const { appDir, home } = aFork();
    expect(loadCloudConfig(appDir, { packaged: true, home, env: {} })).toBeNull();
  });

  it('a demo, which gets its invented team', () => {
    const { appDir, home } = aFork();
    expect(loadCloudConfig(appDir, { packaged: false, home, env: { [DEMO_ENV]: '1' } })).toEqual(DEMO_CLOUD);
  });
});
