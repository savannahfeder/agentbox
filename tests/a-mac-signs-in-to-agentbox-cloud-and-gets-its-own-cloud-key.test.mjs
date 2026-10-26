// A MAC SIGNS IN TO AGENTBOX CLOUD AND GETS ITS OWN CLOUD KEY.
//
// The cloud server (cloud/gateway/) has been live since 2026-10-19
// (w-6633e825a7), but no Mac could reach it: the only way to get a cloud key
// was to hand the server a database session, and nothing in the app did. This
// is the app's half. A Google sign-in is traded once for a cloud key, kept at
// ~/.agentbox/cloud-key; the Mac's cloud.json then names the server, so its
// runs go there (main/cloud/clients.mjs). The owner's own AWS setup is never
// replaced by it, and signing out lets the key go on the server too.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createGateway, gatewayServer, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';
import { cloudAccountConfig, currentCloudTerms, signInToCloud, signOutOfCloud } from '../main/cloud/account.mjs';
import { cloudConfigPath, cloudKeyPath, readCloudConfig, readCloudKey } from '../main/cloud/config.mjs';
import { CLOUD_ADDRESS } from '../shared/cloud-address.mjs';

const P = '66666666-6666-4666-8666-666666666666';
let home; let server; let gateway; const env = {};

beforeEach(async () => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudaccount-'));
  const gw = createGateway({
    agentcore: { async invoke() { return { ok: true }; }, async stop() {} },
    links: { get: async (k) => k, put: async (k) => k, head: async (k) => k },
    removeObject: async () => {},
    objects: memoryObjects(),
    whoIs: async (t) => (t === 'google-session' ? { id: P, email: 'someone@example.com' } : null),
  });
  server = gatewayServer(gw);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  gateway = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  fs.rmSync(home, { recursive: true, force: true });
});

const config = () => ({ gateway, supabaseUrl: 'https://db.example', anonKey: 'public-key' });
const googleSignIn = async () => 'google-session';

describe('where the Mac finds Agentbox Cloud', () => {
  it('is read from the app\'s own folder first, then this Mac, then the one that ships, and half a setting is passed over', () => {
    const app = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudapp-'));
    try {
      expect(cloudAccountConfig(app, { home })).toEqual(CLOUD_ADDRESS);
      fs.mkdirSync(path.join(home, '.agentbox'), { recursive: true });
      fs.writeFileSync(path.join(home, '.agentbox', 'cloud.public.json'), JSON.stringify({ gateway: 'https://home', supabaseUrl: 'https://db', anonKey: 'k' }));
      expect(cloudAccountConfig(app, { home })?.gateway).toBe('https://home');
      fs.mkdirSync(path.join(app, 'cloud'));
      fs.writeFileSync(path.join(app, 'cloud', 'cloud.public.json'), JSON.stringify({ gateway: 'https://app', supabaseUrl: 'https://db', anonKey: 'k' }));
      expect(cloudAccountConfig(app, { home })?.gateway).toBe('https://app');
      fs.writeFileSync(path.join(app, 'cloud', 'cloud.public.json'), JSON.stringify({ gateway: 'https://app' }));
      expect(cloudAccountConfig(app, { home })?.gateway).toBe('https://home');
    } finally { fs.rmSync(app, { recursive: true, force: true }); }
  });

  // A downloaded app has no cloud/ folder: scripts/release.mjs bakes the
  // setting into the packaged package.json, as it does the analytics key.
  it('a release build carries it in its own package.json, and half a setting there is passed over', () => {
    const app = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudapp-'));
    try {
      fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify({ name: 'agentbox-app', bakedCloud: { gateway: 'https://baked', supabaseUrl: 'https://db', anonKey: 'k' } }));
      expect(cloudAccountConfig(app, { home })?.gateway).toBe('https://baked');
      fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify({ name: 'agentbox-app', bakedCloud: { gateway: 'https://baked' } }));
      expect(cloudAccountConfig(app, { home })).toEqual(CLOUD_ADDRESS);
      fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify({ name: 'agentbox-app' }));
      expect(cloudAccountConfig(app, { home })).toEqual(CLOUD_ADDRESS);
    } finally { fs.rmSync(app, { recursive: true, force: true }); }
  });

  it('the release bakes exactly the three public settings it found', () => {
    const release = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'scripts', 'release.mjs'), 'utf8');
    expect(release).toMatch(/const cloud = cloudAccountConfig\(repo\);/);
    expect(release).toMatch(/if \(cloud\) \{\n\s+for \(const k of \['gateway', 'supabaseUrl', 'anonKey'\]\) args\.push\(`-c\.extraMetadata\.bakedCloud\.\$\{k\}=\$\{cloud\[k\]\}`\);/);
  });
});

describe('signing in', () => {
  it('asks the server which terms are current, without being signed in', async () => {
    expect(await currentCloudTerms(config())).toBe(TERMS_VERSION);
  });

  it('trades the Google sign-in for a cloud key, kept for this user only, and points this Mac at the server', async () => {
    const out = await signInToCloud({ config: config(), acceptedTerms: TERMS_VERSION, name: 'A Mac', googleSignIn, env, home });
    expect(out).toMatchObject({ ok: true, plan: 'none' });
    expect(readCloudKey(env, home)).toMatch(/^abk_/);
    expect(fs.statSync(cloudKeyPath(env, home)).mode & 0o777).toBe(0o600);
    expect(readCloudConfig(env, home)).toEqual({ gateway });
  });

  it('without the current terms accepted, keeps nothing and says which terms', async () => {
    const out = await signInToCloud({ config: config(), acceptedTerms: '2026-01-01', name: 'A Mac', googleSignIn, env, home });
    expect(out).toMatchObject({ ok: false, error: 'terms', terms: TERMS_VERSION });
    expect(readCloudKey(env, home)).toBe(null);
    expect(fs.existsSync(cloudConfigPath(env, home))).toBe(false);
  });

  it('a Google sign-in the server does not take keeps nothing', async () => {
    const out = await signInToCloud({ config: config(), acceptedTerms: TERMS_VERSION, name: 'A Mac', googleSignIn: async () => 'someone-else', env, home });
    expect(out).toMatchObject({ ok: false, error: 'signed-out' });
    expect(readCloudKey(env, home)).toBe(null);
  });

  it('a Google sign-in that was cancelled or failed keeps nothing and says why', async () => {
    const out = await signInToCloud({ config: config(), acceptedTerms: TERMS_VERSION, name: 'A Mac', googleSignIn: async () => { throw new Error('Google sign-in timed out. Try again.'); }, env, home });
    expect(out).toMatchObject({ ok: false, error: 'google', message: 'Google sign-in timed out. Try again.' });
    expect(readCloudKey(env, home)).toBe(null);
  });

  it('a Mac that runs the cloud in its own AWS account is never moved onto the server', async () => {
    fs.mkdirSync(path.join(home, '.agentbox'), { recursive: true });
    const own = { region: 'us-east-1', bucket: 'b', runtimeArn: 'arn:x' };
    fs.writeFileSync(cloudConfigPath(env, home), JSON.stringify(own));
    let asked = false;
    const out = await signInToCloud({ config: config(), acceptedTerms: TERMS_VERSION, name: 'A Mac', googleSignIn: async () => { asked = true; return 'google-session'; }, env, home });
    expect(out).toMatchObject({ ok: false, error: 'own-aws' });
    expect(asked).toBe(false);
    expect(readCloudConfig(env, home)).toEqual(own);
    expect(readCloudKey(env, home)).toBe(null);
  });
});

describe('signing out', () => {
  it('lets the key go on the server and on this Mac, and leaves this Mac as it was before', async () => {
    await signInToCloud({ config: config(), acceptedTerms: TERMS_VERSION, name: 'A Mac', googleSignIn, env, home });
    const key = readCloudKey(env, home);
    expect(await signOutOfCloud({ env, home })).toMatchObject({ ok: true });
    expect(readCloudKey(env, home)).toBe(null);
    expect(fs.existsSync(cloudConfigPath(env, home))).toBe(false);
    const res = await fetch(`${gateway}/v1/me`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(5000) });
    expect(res.status).toBe(401);
  });

  it('never touches the owner\'s own AWS setup', async () => {
    fs.mkdirSync(path.join(home, '.agentbox'), { recursive: true });
    const own = { region: 'us-east-1', bucket: 'b', runtimeArn: 'arn:x' };
    fs.writeFileSync(cloudConfigPath(env, home), JSON.stringify(own));
    await signOutOfCloud({ env, home });
    expect(readCloudConfig(env, home)).toEqual(own);
  });
});
