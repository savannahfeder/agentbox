// SWITCHING TO AN ACCOUNT NOT IN THE CLOUD RUNS NOTHING THERE ON ANOTHER.
//
// What broke (2026-10-26): her cloud ran on the Claude account in .claude-2,
// which hit its usage limit. She pressed "Switch to this account" on her
// default account in Settings, and the cloud went on using .claude-2, so every
// thread stayed queued behind its limit. The default account's cloud sign-in
// was marked broken ("missing"), and `accountInUse` skipped it and fell back to
// the first sign-in left: the one she had just switched away from. Read off
// ~/.agentbox/cloud-logins.json and the Mac's account files that evening.
//
// the-cloud-runs-on-the-account-you-switched-to (2026-10-23) kept that
// fallback on purpose. Now the cloud takes the Mac's account or nothing. With no working cloud
// sign-in for it, threads run on this Mac and the cloud menu says why. Only
// when the cloud cannot tell whose a sign-in is (no organization read yet)
// does it still take the first, as before.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';
import { cloudLoginInUse, pickCloudLogin } from '../main/cloud/logins.mts';
import { cloudFootLine } from '../renderer/src/cloud-menu.ts';

const dirs = [];
const setUpConfig = process.env.AGENTBOX_CLOUD_CONFIG;
afterEach(() => {
  while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true });
  process.env.AGENTBOX_CLOUD_CONFIG = setUpConfig;
});
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-switch-')); dirs.push(d); return d; };

const login = (key, extra = {}) => ({ engine: 'claude', id: `id-${key}`, key, savedAt: 1, org: `org-${key}`, ...extra });
function homeWith(...logins) {
  const home = tmp();
  fs.mkdirSync(path.join(home, '.agentbox'));
  fs.writeFileSync(path.join(home, '.agentbox', 'cloud-logins.json'), JSON.stringify(Object.fromEntries(logins.map((r) => [`claude:${r.key}`, r]))));
  return home;
}
const later = Date.now() + 3600_000;

describe('which cloud account a run takes', () => {
  it('not another account when the one you switched to has a broken cloud sign-in', () => {
    const home = homeWith(login('old', { savedAt: 1, limitedUntil: later }), login('mine', { savedAt: 2, broken: 'missing' }));
    expect(cloudLoginInUse('claude', { home, prefer: 'mine' })).toBe(null);
    expect(pickCloudLogin('claude', { home, prefer: 'mine' })).toBe(null);
  });

  it('not another account when the one you switched to is not signed in to the cloud at all', () => {
    const home = homeWith(login('old', { savedAt: 1 }));
    expect(cloudLoginInUse('claude', { home, prefer: null, follow: true })).toBe(null);
  });

  it('the one you switched to, when it is signed in there', () => {
    const home = homeWith(login('old', { savedAt: 1 }), login('mine', { savedAt: 2 }));
    expect(cloudLoginInUse('claude', { home, prefer: 'mine' })?.key).toBe('mine');
  });

  it('the one you switched to, though it is at its limit: still the account, waiting for its reset', () => {
    const home = homeWith(login('old', { savedAt: 1 }), login('mine', { savedAt: 2, limitedUntil: later }));
    expect(cloudLoginInUse('claude', { home, prefer: 'mine' })?.key).toBe('mine');
  });

  it('the first, as before, when nothing says which account is this Mac\'s', () => {
    const home = homeWith(login('old', { savedAt: 1 }), login('mine', { savedAt: 2 }));
    expect(cloudLoginInUse('claude', { home })?.key).toBe('old');
  });
});

function setUpCloud(home) {
  process.env.AGENTBOX_CLOUD_CONFIG = path.join(home, '.agentbox', 'cloud.json');
  fs.writeFileSync(process.env.AGENTBOX_CLOUD_CONFIG, JSON.stringify({ gateway: 'https://example.invalid' }));
}
function supervisor(home) {
  const product = { slug: 'p', dir: home, repoPath: '/r' };
  const sup = new Supervisor(
    { storeRoot: home, home, maxConcurrentSessions: 2, authProfiles: ['default'], cloudRuns: 'all' },
    { listItems: () => [], listProducts: () => [product], isDue: () => true },
    home,
  );
  sup.engineChoices = () => [{ id: 'claude' }];
  return { sup, product };
}

describe('the app asking for this Mac\'s account', () => {
  it('asks strictly when every cloud sign-in says whose it is', () => {
    const { sup } = supervisor(homeWith(login('old')));
    sup._cloudAccountOfThisMac = () => null;
    expect(sup._cloudAccountAsk('claude').follow).toBe(true);
  });

  it('falls back to the first when a working sign-in has no organization yet, since it may be this Mac\'s', () => {
    const { sup } = supervisor(homeWith(login('old', { org: null })));
    sup._cloudAccountOfThisMac = () => null;
    expect(sup._cloudAccountAsk('claude').follow).toBe(false);
  });

  it('with the account you switched to not in the cloud, is not signed in there, and a thread runs here', () => {
    const home = homeWith(login('old', { limitedUntil: later }), login('mine', { savedAt: 2, broken: 'missing' }));
    const { sup, product } = supervisor(home);
    sup._cloudAccountOfThisMac = () => 'mine';
    setUpCloud(home);
    expect(sup._cloudSignedInAtAll('claude')).toBe(false);
    expect(sup._whereToRun({ item: { id: 'w-next', product: 'p' }, product, cwd: '/r/.claude/worktrees/w-next', engine: 'claude' })).toBe('local');
    expect(sup.cloudStatus().notInCloud).toEqual(['claude']);
  });

  it('with the account you switched to signed in there, says nothing is missing', () => {
    const home = homeWith(login('old'), login('mine', { savedAt: 2 }));
    const { sup } = supervisor(home);
    sup._cloudAccountOfThisMac = () => 'mine';
    setUpCloud(home);
    expect(sup._cloudSignedInAtAll('claude')).toBe(true);
    expect(sup.cloudStatus().notInCloud).toEqual([]);
  });
});

describe('the cloud menu', () => {
  const status = (over = {}) => ({ setUp: true, mode: 'all', running: 0, accounts: [], notInCloud: ['claude'], ...over });
  it('says the account this Mac uses is not signed in to the cloud, and that threads run here', () => {
    expect(cloudFootLine(status())).toBe('The Claude account this Mac uses is not signed in to the cloud, so threads run on this Mac. Sign it in to run them there.');
  });
  it('says nothing of it with the cloud off, or with the account signed in', () => {
    expect(cloudFootLine(status({ mode: 'mac' }))).toBe('Nothing running in the cloud now');
    expect(cloudFootLine(status({ notInCloud: [] }))).toBe('Nothing running in the cloud now');
  });
});
