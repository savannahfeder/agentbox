// A REAL SIGN-IN PAGE AND A REAL SIGN-OUT (2026-10-01). Her words: "we were
// trying to get this to a point of complete viability, so it needs a real
// sign-in page and a real sign-out page." Email and password beside Google,
// a page over the whole window while nobody is signed in, and signing out
// landing on it.
import { it, expect, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as disk from '../main/store/work-items.mjs';
import { Store } from '../main/store.mjs';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';
import { createTeamService } from '../main/team/index.mjs';
import { memorySession, plainAuthError } from '../main/team/session.mjs';
import { REQUEST_CHANNELS } from '../shared/bridge-map.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

async function aMac(cloud, personId) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'team-signin-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(accountRoot, { recursive: true });
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  return createTeamService({
    session: memorySession(() => memoryBackend(cloud, personId)),
    store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000,
  });
}

describe('the team service', () => {
  it('says when the first look for a saved sign-in is over, so the window never flashes the page', async () => {
    const cloud = createMemoryCloud();
    const mac = await aMac(cloud, signUpMemory(cloud, { email: 'ada@x.test', name: 'Ada' }));
    expect(mac.state().started).toBe(false);
    await mac.start();
    expect(mac.state()).toMatchObject({ started: true, signedIn: false });
  });

  it('signs in with an email and password, and signing out is a known answer at once', async () => {
    const cloud = createMemoryCloud();
    const mac = await aMac(cloud, signUpMemory(cloud, { email: 'ada@x.test', name: 'Ada' }));
    await mac.start();
    await mac.signInWithEmail('ada@x.test', 'pw');
    expect(mac.state().signedIn).toBe(true);
    await mac.signOut();
    expect(mac.state()).toMatchObject({ started: true, signedIn: false, me: null });
  });

  it('answers a new account that waits on its confirmation email', async () => {
    const cloud = createMemoryCloud();
    const mac = await aMac(cloud, signUpMemory(cloud, { email: 'bo@x.test', name: 'Bo' }));
    const out = await mac.signUp('bo@x.test', 'secret1', 'Bo');
    expect(out.confirm).toBe(true);
    expect(mac.state().signedIn).toBe(false);
  });
});

describe('the cloud\'s refusals, in words', () => {
  it.each([
    ['Invalid login credentials', 'That email and password do not match an account.'],
    ['Email not confirmed', 'Confirm your email first: follow the link we sent, then sign in.'],
    ['User already registered', 'There is already an account with that email. Sign in instead.'],
  ])('%s', (raw, said) => expect(plainAuthError(raw)).toBe(said));
});

describe('the doors and the page', () => {
  it('reaches a browser tab as well as the desktop window', () => {
    expect(REQUEST_CHANNELS.teamSignInEmail).toBe('zero:team-sign-in-email');
    expect(REQUEST_CHANNELS.teamSignUp).toBe('zero:team-sign-up');
    expect(read('preload.cjs')).toContain("teamSignInEmail: (payload) => ipcRenderer.invoke('zero:team-sign-in-email', payload)");
  });

  it('stands over the whole app while a team build has nobody signed in', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).toContain("snap.team.started === true && !snap.team.signedIn");
    expect(app).toContain('<SignInPage signedOut={signedOutHere}');
    expect(app).toMatch(/if \(signInGateRef\.current\) return;/);
  });

  it('offers Google first, then email and password, and a way to make an account', () => {
    const page = read('renderer/src/team/SignInPage.tsx');
    expect(page.indexOf('Continue with Google')).toBeLessThan(page.indexOf('type="password"'));
    expect(page).toContain('Create an account');
    expect(page).toContain('You are signed out');
    expect(page).not.toMatch(/—/);
  });
});
