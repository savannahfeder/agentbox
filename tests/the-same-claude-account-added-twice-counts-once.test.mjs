// THE SAME CLAUDE ACCOUNT ADDED TWICE TO THE CLOUD COUNTS ONCE.
//
// What happened (2026-10-16): her two cloud accounts hit their session limit
// at the same minute, and she guessed "it's probably the same account counted
// twice". Measured that evening from the cloud machine, with each account's
// own sign-in: the profile lookup is refused for these sign-ins (403, missing
// user:profile scope), which is why every account showed only as "Claude",
// but a free token count answers with the account's organization id, and the
// first two answered the same one; the third, added that night, a different one.
//
// Now each cloud Claude account's organization id is read once, by a short
// cloud run (the sign-in never comes to this Mac), and a later account with
// the same id as an earlier one is the same account: it does not count, no
// run is given to it, and the setup screen says so beside its ×.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { recordCloudLogin, markCloudLogin, listCloudLogins, cloudLoginState, mayRunOn, pickCloudLogin } from '../main/cloud/logins.mjs';
import { orgFromOutput } from '../main/cloud/org.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { SETUP } from '../renderer/src/cloud-setup';
import { countedAccounts } from '../renderer/src/cloud-menu';

const dirs = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-org-')); dirs.push(d); return d; };
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true }); });
const three = (home) => {
  recordCloudLogin('claude', 'a', { id: 'A', savedAt: 1 }, { home });
  recordCloudLogin('claude', 'b', { id: 'B', savedAt: 2 }, { home });
  recordCloudLogin('claude', 'c', { id: 'C', savedAt: 3 }, { home });
};

describe('two cloud accounts with one organization', () => {
  it('the later one is the same account as the earlier, and may not run', () => {
    const home = tmp();
    three(home);
    markCloudLogin('claude', 'a', 'A', { org: 'org-1' }, { home });
    markCloudLogin('claude', 'b', 'B', { org: 'org-1' }, { home });
    markCloudLogin('claude', 'c', 'C', { org: 'org-2' }, { home });
    const byKey = Object.fromEntries(listCloudLogins('claude', { home }).map((r) => [r.key, r]));
    expect(byKey.a.duplicateOf ?? null).toBe(null);
    expect(byKey.b.duplicateOf).toBe('a');
    expect(byKey.c.duplicateOf ?? null).toBe(null);
    expect(cloudLoginState(byKey.b)).toBe('duplicate');
    expect(mayRunOn('duplicate')).toBe(false);
    expect(cloudLoginState(byKey.a)).toBe('ready');
  });

  // One account carries the cloud's runs (w-dac993a554), so the duplicate is
  // read by its being passed over for the account it duplicates.
  it('is never picked for a run', () => {
    const home = tmp();
    three(home);
    markCloudLogin('claude', 'a', 'A', { org: 'org-1' }, { home });
    markCloudLogin('claude', 'b', 'B', { org: 'org-1' }, { home });
    const picked = new Set([1, 2, 3, 4, 5, 6].map(() => pickCloudLogin('claude', { home }).key));
    expect([...picked].sort()).toEqual(['a']);
    // And with that account gone it is still the duplicate that is skipped.
    markCloudLogin('claude', 'a', 'A', { broken: 'refused' }, { home });
    expect(pickCloudLogin('claude', { home }).key).toBe('c');
  });

  it('an account whose organization is not known yet is not called a duplicate', () => {
    const home = tmp();
    three(home);
    markCloudLogin('claude', 'a', 'A', { org: 'org-1' }, { home });
    expect(listCloudLogins('claude', { home }).every((r) => !r.duplicateOf)).toBe(true);
  });
});

describe('reading the organization', () => {
  it('takes the id off the probe\'s own line and nothing else', () => {
    expect(orgFromOutput('noise\nagentbox-org:c2cf0285-cffe-4b9f-a14d-b3a03f6a2b56\n')).toBe('c2cf0285-cffe-4b9f-a14d-b3a03f6a2b56');
    expect(orgFromOutput('agentbox-org:\n')).toBe(null);
    expect(orgFromOutput('agentbox-org:not an id; rm -rf /\n')).toBe(null);
    expect(orgFromOutput('')).toBe(null);
  });

  it('is asked once per account that has none, one at a time, and recorded', async () => {
    const home = tmp();
    three(home);
    markCloudLogin('claude', 'a', 'A', { org: 'org-1' }, { home });
    const sup = new Supervisor({ storeRoot: home, home, maxConcurrentSessions: 3 }, { listItems: () => [], listProducts: () => [], isDue: () => true }, home);
    sup._cloudConfig = { bucket: 'x' };
    const asked = [];
    sup._readCloudOrg = async (rec) => { asked.push(rec.key); return rec.key === 'b' ? 'org-1' : 'org-3'; };
    await sup._noteCloudOrgs();
    await sup._noteCloudOrgs();
    await sup._noteCloudOrgs();
    expect(asked).toEqual(['b', 'c']);
    const byKey = Object.fromEntries(listCloudLogins('claude', { home }).map((r) => [r.key, r]));
    expect(byKey.b.org).toBe('org-1');
    expect(byKey.b.duplicateOf).toBe('a');
    expect(byKey.c.org).toBe('org-3');
  });
});

describe('on the screen', () => {
  it('a duplicate does not count, and its row says why', () => {
    const accounts = [
      { engine: 'claude', key: 'a', name: null, ready: true, state: 'ready' },
      { engine: 'claude', key: 'b', name: null, ready: false, state: 'duplicate', duplicateOf: 'a' },
    ];
    expect(countedAccounts(accounts)).toHaveLength(1);
    expect(SETUP.sameAccount).toMatch(/same Claude account/i);
    const row = fs.readFileSync(new URL('../renderer/src/components/CloudSetup.tsx', import.meta.url), 'utf8');
    expect(row).toMatch(/a\.state === 'duplicate' && <small className="cs-row-why">\{SETUP\.sameAccount\}<\/small>/);
  });
});
