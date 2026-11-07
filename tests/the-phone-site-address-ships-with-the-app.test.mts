// THE PHONE SITE'S ADDRESS SHIPS WITH THE APP (2026-10-28).
//
// A tester on the 0.1.17 download, signed in with Cloud on, read Settings ›
// Phone: "Not set up yet. The phone site has no address yet." with no way on.
// The site was up (agentbox-phone.pages.dev answered 200, and its bundle signs
// in to the same database shared/cloud-address.mjs ships). The address only
// reached an installed app if the releasing Mac's team.config.json named it as
// `phoneSite`, and that build was baked without one. Now the address ships in
// the code beside the database it belongs to, and fills in for any config
// pointed at that database; another team's cloud gets none.
import { it, expect, describe, afterEach, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadCloudConfig } from '../main/team/session.mjs';
import { CLOUD_ADDRESS, PHONE_SITE } from '../shared/cloud-address.mjs';

const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `phone-ships-${name}-`));
const OURS = { url: CLOUD_ADDRESS.supabaseUrl, anonKey: CLOUD_ADDRESS.anonKey };
const HOSTED = 'https://agentbox-phone.pages.dev';

function anInstalledApp(bakedTeam) {
  const appDir = tmp('app');
  fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({ name: 'agentbox-app', ...(bakedTeam ? { bakedTeam } : {}) }));
  return { appDir, home: tmp('home') };
}

function aCheckout(inFolder) {
  const appDir = tmp('checkout');
  fs.mkdirSync(path.join(appDir, 'cloud'));
  fs.writeFileSync(path.join(appDir, 'cloud', 'team.config.json'), JSON.stringify(inFolder));
  return { appDir, home: tmp('home') };
}

const was = process.env.AGENTBOX_TEAM_CONFIG;
beforeEach(() => { delete process.env.AGENTBOX_TEAM_CONFIG; });
afterEach(() => { if (was === undefined) delete process.env.AGENTBOX_TEAM_CONFIG; else process.env.AGENTBOX_TEAM_CONFIG = was; });

describe('the phone site address', () => {
  it('is the hosted site', () => {
    expect(PHONE_SITE).toBe(HOSTED);
  });

  it('reaches an installed app baked with our cloud and no address (the reported case)', () => {
    const { appDir, home } = anInstalledApp(OURS);
    expect(loadCloudConfig(appDir, { packaged: true, home }).phoneSite).toBe(HOSTED);
  });

  it('matches our database with a trailing slash too', () => {
    const { appDir, home } = anInstalledApp({ ...OURS, url: `${OURS.url}/` });
    expect(loadCloudConfig(appDir, { packaged: true, home }).phoneSite).toBe(HOSTED);
  });

  it('baked into a build wins over the one in the code', () => {
    const { appDir, home } = anInstalledApp({ ...OURS, phoneSite: 'https://baked-phone.test' });
    expect(loadCloudConfig(appDir, { packaged: true, home }).phoneSite).toBe('https://baked-phone.test');
  });

  it('is not given to a build baked with another cloud', () => {
    const { appDir, home } = anInstalledApp({ url: 'https://other-team.supabase.co', anonKey: 'k' });
    expect(loadCloudConfig(appDir, { packaged: true, home }).phoneSite).toBeUndefined();
  });

  it('does not make a build with no cloud baked in sign in anywhere', () => {
    const { appDir, home } = anInstalledApp(null);
    expect(loadCloudConfig(appDir, { packaged: true, home })).toBeNull();
  });

  it('reaches a checkout whose file points at our cloud without one', () => {
    const { appDir, home } = aCheckout(OURS);
    expect(loadCloudConfig(appDir, { packaged: false, home, env: {} }).phoneSite).toBe(HOSTED);
  });

  it('is not given to a checkout pointed at another team\'s cloud', () => {
    const { appDir, home } = aCheckout({ url: 'https://other-team.supabase.co', anonKey: 'k' });
    expect(loadCloudConfig(appDir, { packaged: false, home, env: {} }).phoneSite).toBeUndefined();
  });
});
