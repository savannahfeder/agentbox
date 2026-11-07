// SIGNING IN TO THE CLOUD ALSO CONNECTS THE PHONE (QA batch 012, M-03).
//
// A tester signed in to Agentbox Cloud from the Cloud popover, then opened
// Settings › Phone: it still said "Sign in to use your phone", after a
// relaunch too, 3 times in 3. The cloud sign-in (main/cloud/account.mts) traded
// its database session for a cloud key and dropped it, and the phone side
// (main/team/) waits for a session of its own, so the computer never sent its
// threads and the phone kept showing an older computer's (M-04, M-05).
// Measured here: after a cloud sign-in the same database session reaches the
// phone side and signs it in, once; another database's session does not.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cloudAccountSession } from '../main/cloud/account.mts';
import { supabaseSession, memorySession } from '../main/team/session.mjs';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import * as disk from '../main/store/work-items.mjs';
import { Store } from '../main/store.mts';

const ROOT = path.join(import.meta.dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const CONFIG = { gateway: 'https://gw.example', supabaseUrl: 'https://db.example', anonKey: 'k' };

const fakeClient = () => () => ({
  auth: {
    async signInWithPassword({ password }) {
      return password === 'right'
        ? { data: { session: { access_token: 'at', refresh_token: 'rt' } }, error: null }
        : { data: {}, error: { message: 'Invalid login credentials' } };
    },
  },
});

describe('the cloud sign-in keeps its database session for the phone', () => {
  it('hands it over once after a sign-in', async () => {
    const s = cloudAccountSession({ config: CONFIG, openExternal: () => {}, createClient: fakeClient() });
    await s.email('a@example.com', 'right');
    expect(s.takeSession()).toEqual({ supabaseUrl: 'https://db.example', access_token: 'at', refresh_token: 'rt' });
    expect(s.takeSession()).toBeNull();
  });

  it('has nothing to hand over after a refused sign-in', async () => {
    const s = cloudAccountSession({ config: CONFIG, openExternal: () => {}, createClient: fakeClient() });
    await expect(s.email('a@example.com', 'wrong')).rejects.toThrow();
    expect(s.takeSession()).toBeNull();
  });
});

describe('the phone side takes a session only from its own database', () => {
  const session = (url) => supabaseSession({ cloudConfig: url ? { url, anonKey: 'k' } : null, sessionFile: path.join(os.tmpdir(), `never-${process.pid}`), packaged: true });

  it('refuses one from another database', async () => {
    expect(await session('https://db.example').adoptSession({ supabaseUrl: 'https://other.example', access_token: 'at', refresh_token: 'rt' })).toBeNull();
  });

  it('refuses one on a copy with no account database', async () => {
    expect(await session(null).adoptSession({ supabaseUrl: 'https://db.example', access_token: 'at', refresh_token: 'rt' })).toBeNull();
  });

  it('refuses nothing at all', async () => {
    expect(await session('https://db.example').adoptSession(null)).toBeNull();
  });
});

describe('the phone side signs in with the handed-over session', () => {
  async function aService(sessionFor) {
    disk._internals.forgetFolds();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-phone-'));
    const accountRoot = path.join(dir, 'accounts', 'a');
    fs.mkdirSync(accountRoot, { recursive: true });
    const store = await new Store({ storeRoot: dir, accountId: 'a', accountRoot, products: [] }).init();
    const cloud = createMemoryCloud();
    const me = signUpMemory(cloud, { email: 'owner@example.com' });
    const service = createTeamService({ session: sessionFor(() => memoryBackend(cloud, me)), store, disk, accountRoot, stateFile: path.join(dir, '.team-sync.json'), intervalMs: 3_600_000 });
    return { service, done: async () => { await service.signOut(); fs.rmSync(dir, { recursive: true, force: true }); } };
  }

  it('is signed in afterwards, as the person the session belongs to (the reported case)', async () => {
    const { service, done } = await aService(memorySession);
    expect(service.state().signedIn).toBe(false);
    await service.adoptSession({ supabaseUrl: 'https://db.example', access_token: 'at', refresh_token: 'rt' });
    expect(service.state()).toMatchObject({ signedIn: true, me: { email: 'owner@example.com' } });
    await done();
  });

  it('stays signed out when the session is refused', async () => {
    const { service, done } = await aService((b) => ({ ...memorySession(b), adoptSession: async () => null }));
    await service.adoptSession({ supabaseUrl: 'https://other.example', access_token: 'at', refresh_token: 'rt' });
    expect(service.state().signedIn).toBe(false);
    await done();
  });

  it('leaves a phone side already signed in alone', async () => {
    let asked = 0;
    const { service, done } = await aService((b) => ({ ...memorySession(b), adoptSession: async () => { asked += 1; return b(); } }));
    await service.signIn();
    await service.adoptSession({ supabaseUrl: 'https://db.example', access_token: 'at', refresh_token: 'rt' });
    expect(asked).toBe(0);
    await done();
  });
});

describe('the window', () => {
  it('hands the session over after a sign-in and after a new account\'s email link', () => {
    const ipc = read('main/ipc.mts');
    const handler = ipc.slice(ipc.indexOf("'zero:cloud-account-sign-in'"), ipc.indexOf("'zero:cloud-account-cancel'"));
    expect(handler).toMatch(/connectThePhone\(acct\)/);
    const link = ipc.slice(ipc.indexOf('const waitForTheLink'), ipc.indexOf("'zero:cloud-account-sign-in'"));
    expect(link).toMatch(/connectThePhone\(acct\)/);
  });
});
