// THE PHONE SITE'S ADDRESS IN THE HOME FOLDER REACHES SETTINGS (2026-10-16).
//
// Settings › Phone said "Not set up yet. The phone site has no address yet."
// while the site was up (it answered 200) and ~/.agentbox/team.config.json held
// its address as `phoneSite`, where scripts/deploy-phone-site.mjs says to put it.
// The app was run from a checkout whose own cloud/team.config.json predates the
// site, and loadCloudConfig took the first file with a key and read no further,
// so the address never reached the page. Now a field the folder's file lacks is
// taken from the Mac's file when both point at the same cloud.
import { it, expect, describe, afterEach, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadCloudConfig } from '../main/team/session.mjs';

const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `phone-site-${name}-`));
const CLOUD = { url: 'https://hers.test', anonKey: 'anon' };

function aMac({ inHome = null, inFolder = null } = {}) {
  const home = tmp('home');
  const appDir = tmp('app');
  if (inHome) {
    fs.mkdirSync(path.join(home, '.agentbox'), { recursive: true });
    fs.writeFileSync(path.join(home, '.agentbox', 'team.config.json'), JSON.stringify(inHome));
  }
  if (inFolder) {
    fs.mkdirSync(path.join(appDir, 'cloud'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'cloud', 'team.config.json'), JSON.stringify(inFolder));
  }
  return { home, appDir };
}

const was = process.env.AGENTBOX_TEAM_CONFIG;
const wasHome = process.env.AGENTBOX_HOME;
beforeEach(() => {
  delete process.env.AGENTBOX_TEAM_CONFIG;
  delete process.env.AGENTBOX_HOME;
});
afterEach(() => {
  if (was === undefined) delete process.env.AGENTBOX_TEAM_CONFIG; else process.env.AGENTBOX_TEAM_CONFIG = was;
  if (wasHome === undefined) delete process.env.AGENTBOX_HOME; else process.env.AGENTBOX_HOME = wasHome;
});

describe('the phone site address', () => {
  it('is read from the Mac\'s file when the folder\'s file for the same cloud has none', () => {
    const { home, appDir } = aMac({ inFolder: CLOUD, inHome: { ...CLOUD, phoneSite: 'https://phone.test' } });
    const c = loadCloudConfig(appDir, { packaged: false, home });
    expect(c.url).toBe('https://hers.test');
    expect(c.phoneSite).toBe('https://phone.test');
  });

  it('in the folder\'s own file wins over the Mac\'s', () => {
    const { home, appDir } = aMac({ inFolder: { ...CLOUD, phoneSite: 'https://folder-phone.test' }, inHome: { ...CLOUD, phoneSite: 'https://phone.test' } });
    expect(loadCloudConfig(appDir, { packaged: false, home }).phoneSite).toBe('https://folder-phone.test');
  });

  it('is not borrowed from the Mac\'s file when that file is for another cloud', () => {
    const { home, appDir } = aMac({ inFolder: { url: 'https://other-team.test', anonKey: 'k' }, inHome: { ...CLOUD, phoneSite: 'https://phone.test' } });
    const c = loadCloudConfig(appDir, { packaged: false, home });
    expect(c.url).toBe('https://other-team.test');
    expect(c.anonKey).toBe('k');
    expect(c.phoneSite).toBeUndefined();
  });

  it('is there when only the Mac has a file', () => {
    const { home, appDir } = aMac({ inHome: { ...CLOUD, phoneSite: 'https://phone.test' } });
    expect(loadCloudConfig(appDir, { packaged: false, home }).phoneSite).toBe('https://phone.test');
  });

  it('never reaches an installed app, which reads no cloud at all', () => {
    const { home, appDir } = aMac({ inFolder: CLOUD, inHome: { ...CLOUD, phoneSite: 'https://phone.test' } });
    expect(loadCloudConfig(appDir, { packaged: true, home })).toBeNull();
  });
});
