// EVERY COPY OF THE APP OFFERS AGENTBOX CLOUD, HOWEVER IT WAS INSTALLED.
//
// A teammate running the app from a GitHub checkout had no cloud button and no
// Cloud page in Settings through any number of updates. The cloud's address
// lived only in cloud/cloud.public.json, which git ignores, or baked into a
// Mac download (0.1.16 on). Measured 2026-10-26: cloudAccountConfig returned
// null for a checkout holding only the team file, and the npm package that
// `npx agentbox-app` runs (0.1.16) carried no address at all. The address and
// its key are public and already sit in every download, so they now ship in
// shared/cloud-address.mjs.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cloudAccountConfig } from '../main/cloud/config.mjs';
import { CLOUD_ADDRESS } from '../shared/cloud-address.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { loadCloudConfig } from '../main/team/session.mjs';

let home; let app; let setUpFile;
const suiteSetUpFile = process.env.AGENTBOX_CLOUD_CONFIG;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudhome-'));
  app = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudapp-'));
  fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify({ name: 'agentbox-app' }));
  setUpFile = path.join(home, '.agentbox', 'cloud.json');
  process.env.AGENTBOX_CLOUD_CONFIG = setUpFile;
});

afterEach(() => {
  process.env.AGENTBOX_CLOUD_CONFIG = suiteSetUpFile;
  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(app, { recursive: true, force: true });
});

const write = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
};

describe('where a copy finds Agentbox Cloud', () => {
  it('a GitHub checkout holding only the team file, on a computer with nothing, finds the cloud', () => {
    write(path.join(app, 'cloud', 'team.config.json'), { url: 'https://db.example', anonKey: 'k' });
    expect(cloudAccountConfig(app, { home })).toEqual(CLOUD_ADDRESS);
  });

  it('so does the npm package, which has no cloud/ folder and nothing baked in', () => {
    expect(cloudAccountConfig(app, { home })).toEqual(CLOUD_ADDRESS);
    const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(pkg.files).toContain('shared/**/*.mjs');
    expect(pkg.build.files).toContain('shared/**/*');
    expect([...pkg.files, ...pkg.build.files].join(' ')).not.toMatch(/cloud-address/);
  });

  it('a file in the folder, a file on this computer, or a baked release still points a copy elsewhere', () => {
    write(path.join(app, 'package.json'), { name: 'agentbox-app', bakedCloud: { gateway: 'https://baked', supabaseUrl: 'https://db', anonKey: 'k' } });
    expect(cloudAccountConfig(app, { home }).gateway).toBe('https://baked');
    write(path.join(home, '.agentbox', 'cloud.public.json'), { gateway: 'https://home', supabaseUrl: 'https://db', anonKey: 'k' });
    expect(cloudAccountConfig(app, { home }).gateway).toBe('https://home');
    write(path.join(app, 'cloud', 'cloud.public.json'), { gateway: 'https://app', supabaseUrl: 'https://db', anonKey: 'k' });
    expect(cloudAccountConfig(app, { home }).gateway).toBe('https://app');
  });

  it('half a setting anywhere is passed over, down to the one that ships', () => {
    write(path.join(app, 'cloud', 'cloud.public.json'), { gateway: 'https://app' });
    write(path.join(home, '.agentbox', 'cloud.public.json'), { supabaseUrl: 'https://db', anonKey: 'k' });
    write(path.join(app, 'package.json'), { name: 'agentbox-app', bakedCloud: { gateway: 'https://baked' } });
    expect(cloudAccountConfig(app, { home })).toEqual(CLOUD_ADDRESS);
  });
});

describe('the cloud button', () => {
  const status = () => new Supervisor({ home, appDir: app, storeRoot: home, authProfiles: ['default'] },
    { listItems: () => [], listProducts: () => [], isDue: () => true, settleAnswer() {}, readItem: () => null }, app).cloudStatus();

  it('is offered on a copy nobody has set up', () => {
    expect(status()).toMatchObject({ setUp: false, offered: true, managed: false });
  });

  it('is not offered as a sign-up to a computer already signed in to the cloud', () => {
    write(setUpFile, { gateway: CLOUD_ADDRESS.gateway });
    expect(status()).toMatchObject({ setUp: true, offered: false, managed: true });
  });

  it('nor to one set up on its own AWS account', () => {
    write(setUpFile, { bucket: 'b', runtimeArn: 'arn:aws:bedrock-agentcore:us-east-1:000000000000:runtime/r', region: 'us-east-1' });
    expect(status()).toMatchObject({ setUp: true, offered: false, managed: false });
  });
});

describe('what ships is public', () => {
  const claims = (jwt) => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));

  it('the key is the database\'s anon key, which Supabase makes to be shipped in apps, and never its service key', () => {
    const c = claims(CLOUD_ADDRESS.anonKey);
    expect(c.role).toBe('anon');
    expect(c.iss).toBe('supabase');
    expect(new URL(CLOUD_ADDRESS.supabaseUrl).hostname).toBe(`${c.ref}.supabase.co`);
  });

  it('both addresses are https and carry nothing but a host', () => {
    for (const u of [CLOUD_ADDRESS.gateway, CLOUD_ADDRESS.supabaseUrl]) {
      const url = new URL(u);
      expect(url.protocol).toBe('https:');
      expect(`${url.username}${url.password}${url.search}${url.hash}`).toBe('');
      expect(url.pathname).toBe('/');
    }
  });

  it('and a copy holding it is still the single-person app until it is given the team file', () => {
    expect(loadCloudConfig(app, { packaged: false, home, env: {} })).toBe(null);
    write(path.join(app, 'cloud', 'team.config.json'), { url: CLOUD_ADDRESS.supabaseUrl, anonKey: CLOUD_ADDRESS.anonKey });
    expect(loadCloudConfig(app, { packaged: false, home, env: {} })?.url).toBe(CLOUD_ADDRESS.supabaseUrl);
  });

  it('cannot be changed by the code that reads it', () => {
    expect(Object.isFrozen(CLOUD_ADDRESS)).toBe(true);
    expect(cloudAccountConfig(app, { home })).not.toBe(CLOUD_ADDRESS);
  });
});
