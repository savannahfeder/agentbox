// THE CLOUD SIGNS IN ON THE APP'S OWN SIGN-IN PAGE.
//
// The owner's call, 2026-10-20 (w-6633e825a7): five new sign-in screens were
// drawn for Agentbox Cloud and turned down ("not the most beautiful"), with
// "you don't need to log in just through Google. We should have standard
// sign-in. We already have a sign-in page built." So the cloud uses that page,
// team/SignInPage.tsx, with Google or an email and a password, a way back,
// and one line saying continuing accepts the terms. Signing in there gets this
// Mac its cloud key (main/cloud/account.mjs), and the cloud button is drawn on
// any Mac the cloud is offered to, not only one set up on its own AWS.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Supervisor } from '../main/supervisor.mjs';
import { createGateway, gatewayServer, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { cloudAccountSession, cloudSignIn } from '../main/cloud/account.mjs';
import { readCloudKey, readCloudConfig, writeCloudKey, cloudConfigPath } from '../main/cloud/config.mjs';
import { REQUEST_CHANNELS } from '../shared/bridge-map.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const P = '77777777-7777-4777-8777-777777777777';
let tmp; let server; let gateway; let configBefore;

beforeEach(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloudsignin-')));
  // The supervisor reads this Mac's cloud.json where the environment says.
  configBefore = process.env.AGENTBOX_CLOUD_CONFIG;
  process.env.AGENTBOX_CLOUD_CONFIG = path.join(tmp, '.agentbox', 'cloud.json');
  const gw = createGateway({
    agentcore: { async invoke() { return { ok: true }; }, async stop() {} },
    links: { get: async (k) => k, put: async (k) => k, head: async (k) => k },
    removeObject: async () => {},
    objects: memoryObjects(),
    whoIs: async (t) => (t === 'email-session' || t === 'google-session' ? { id: P } : null),
  });
  server = gatewayServer(gw);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  gateway = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  if (configBefore === undefined) delete process.env.AGENTBOX_CLOUD_CONFIG; else process.env.AGENTBOX_CLOUD_CONFIG = configBefore;
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  fs.rmSync(tmp, { recursive: true, force: true });
});

const offerIn = (dir) => {
  fs.mkdirSync(path.join(dir, 'cloud'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'cloud', 'cloud.public.json'), JSON.stringify({ gateway, supabaseUrl: 'https://db.example', anonKey: 'public-key' }));
};
const supervisor = (appDir) => {
  const sup = new Supervisor({ storeRoot: tmp, home: tmp, authProfiles: ['default'] }, { listItems: () => [], listProducts: () => [], isDue: () => true }, appDir);
  sup._saveState = () => {};
  return sup;
};

// A stand-in for the database's sign-in client.
function fakeClient({ password = 'right', confirmFirst = false } = {}) {
  return () => ({
    auth: {
      async signInWithPassword({ password: pw }) {
        return pw === password ? { data: { session: { access_token: 'email-session' } }, error: null } : { data: {}, error: { message: 'Invalid login credentials' } };
      },
      async signUp() { return confirmFirst ? { data: { session: null }, error: null } : { data: { session: { access_token: 'email-session' } }, error: null }; },
    },
  });
}

describe('whether the cloud is offered on this Mac', () => {
  it('a Mac whose app carries the cloud\'s settings is offered it, before anyone has signed in', () => {
    const app = path.join(tmp, 'app');
    offerIn(app);
    expect(supervisor(app).cloudStatus()).toMatchObject({ setUp: false, offered: true });
  });

  // tests/every-copy-of-the-app-offers-agentbox-cloud
  it('a Mac without them is offered the cloud every copy ships with, and one already set up on its own AWS is not', () => {
    const app = path.join(tmp, 'app');
    fs.mkdirSync(app, { recursive: true });
    expect(supervisor(app).cloudStatus()).toMatchObject({ setUp: false, offered: true });
    offerIn(app);
    fs.mkdirSync(path.join(tmp, '.agentbox'), { recursive: true });
    fs.writeFileSync(cloudConfigPath({}, tmp), JSON.stringify({ region: 'us-east-1', bucket: 'b', runtimeArn: 'arn:x' }));
    expect(supervisor(app).cloudStatus()).toMatchObject({ setUp: true, offered: false, managed: false });
  });

  it('once signed in, the Mac is set up, through the cloud server', () => {
    const app = path.join(tmp, 'app');
    offerIn(app);
    fs.mkdirSync(path.join(tmp, '.agentbox'), { recursive: true });
    fs.writeFileSync(cloudConfigPath({}, tmp), JSON.stringify({ gateway }));
    writeCloudKey('abk_x', {}, tmp);
    expect(supervisor(app).cloudStatus()).toMatchObject({ setUp: true, offered: false, managed: true });
  });
});

describe('signing in for the cloud', () => {
  const config = () => ({ gateway, supabaseUrl: 'https://db.example', anonKey: 'public-key' });

  // From a page showing the terms; a sign-in that never showed them is
  // tests/signing-in-never-agrees-to-the-terms-for-you.
  it('with an email and a password, gets this Mac its cloud key on the current terms', async () => {
    const session = cloudAccountSession({ config: config(), createClient: fakeClient() });
    const out = await cloudSignIn({ config: config(), session, method: 'email', email: 'me@example.com', password: 'right', acceptTerms: true, env: {}, home: tmp });
    expect(out).toMatchObject({ ok: true });
    expect(readCloudKey({}, tmp)).toMatch(/^abk_/);
    expect(readCloudConfig({}, tmp)).toEqual({ gateway });
  });

  it('a wrong password is said plainly, and nothing is kept', async () => {
    const session = cloudAccountSession({ config: config(), createClient: fakeClient() });
    const out = await cloudSignIn({ config: config(), session, method: 'email', email: 'me@example.com', password: 'wrong', env: {}, home: tmp });
    expect(out).toMatchObject({ ok: false, error: 'That email and password do not match an account.' });
    expect(readCloudKey({}, tmp)).toBe(null);
  });

  it('a new account waiting on its confirmation email says so, and gets no key yet', async () => {
    const session = cloudAccountSession({ config: config(), createClient: fakeClient({ confirmFirst: true }) });
    const out = await cloudSignIn({ config: config(), session, method: 'sign-up', name: 'Me', email: 'me@example.com', password: 'right', env: {}, home: tmp });
    expect(out).toMatchObject({ ok: true, confirm: true });
    expect(readCloudKey({}, tmp)).toBe(null);
  });

  it('with Google, the same', async () => {
    const session = { google: async () => 'google-session' };
    const out = await cloudSignIn({ config: config(), session, method: 'google', acceptTerms: true, env: {}, home: tmp });
    expect(out).toMatchObject({ ok: true });
    expect(readCloudKey({}, tmp)).toMatch(/^abk_/);
  });
});

describe('the page and the wiring', () => {
  it('the app asks for it through its own channels', () => {
    expect(REQUEST_CHANNELS.cloudAccountSignIn).toBe('zero:cloud-account-sign-in');
    expect(REQUEST_CHANNELS.cloudAccountCancel).toBe('zero:cloud-account-cancel');
    expect(read('preload.cjs')).toContain("cloudAccountSignIn: (payload) => ipcRenderer.invoke('zero:cloud-account-sign-in', payload)");
    expect(read('main/ipc.mjs')).toContain("ipcMain.handle('zero:cloud-account-sign-in'");
  });

  it('is the app\'s own sign-in page, with Google and email, a way back, and the terms line, never new screens', () => {
    const page = read('renderer/src/team/SignInPage.tsx');
    expect(page).toContain("purpose === 'cloud'");
    expect(page).toContain('api.cloudAccountSignIn');
    expect(page).toContain('By creating an account or continuing with Google, you agree to');
    expect(page).toMatch(/onClose/);
    const app = read('renderer/src/App.tsx');
    expect(app).toContain('<SignInPage purpose="cloud"');
  });

  // The owner first said the cloud's sign-up needed no name (2026-10-20), then
  // that a third field is what tells sign-up from sign-in (2026-10-23).
  it('creating an account asks a name, for the cloud as for the team', () => {
    const page = read('renderer/src/team/SignInPage.tsx');
    expect(page).toContain("{mode === 'sign-up' && (");
    expect(page).toContain("(mode !== 'sign-up' || !!name.trim())");
  });

  it('the cloud button is drawn on any Mac the cloud is offered to', () => {
    expect(read('renderer/src/threads/Pages.tsx')).toMatch(/\(cloud\?\.setUp \|\| cloud\?\.offered\) && <CloudButton/);
  });
});
