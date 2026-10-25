// REFRESH READS THE CLOUD EVEN WHILE A LOOK IS RUNNING, AND A LOOK THAT FAILS
// SAYS WHY.
//
// What broke (2026-10-21, a screenshot of Settings › Claude Code): the page
// said "Checked just now" beside Refresh while a cloud account under it said
// "Checked 2 hours ago". Opening the page starts a look at every cloud login
// not read in ten minutes, one sandbox session each; a Refresh pressed while
// that ran returned at once (`_cloudLooking`), so it never reached the cloud.
// And a look that failed was caught as 'failed' and dropped, so the tile kept
// its old numbers with nothing to say why.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cloudLoginFor, lookAtCloudLogin, recordCloudLogin } from '../main/cloud/logins.mjs';
import { Supervisor } from '../main/supervisor.mjs';

let home;
const savedConfig = process.env.AGENTBOX_CLOUD_CONFIG;
beforeEach(() => {
  home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-refresh-')));
  process.env.AGENTBOX_CLOUD_CONFIG = path.join(home, 'cloud.json');
  fs.writeFileSync(process.env.AGENTBOX_CLOUD_CONFIG, JSON.stringify({ gateway: 'https://cloud.example.test' }));
});
afterEach(() => {
  if (savedConfig === undefined) delete process.env.AGENTBOX_CLOUD_CONFIG; else process.env.AGENTBOX_CLOUD_CONFIG = savedConfig;
  fs.rmSync(home, { recursive: true, force: true });
});

const storage = { getUrl: async () => 'https://example.test/login', putUrl: async () => 'https://example.test/put' };
// A cloud whose looks each end the way `end` says, and which holds the first
// one open until `release` is called.
function cloud(end = { state: 'saved', org: 'org-1', limits: [{ span: 'session', percent: 10, resetsAt: null }] }) {
  const looked = [];
  let release;
  const held = new Promise((r) => { release = r; });
  const transport = {
    invoke: async (_id, p) => {
      if (p.action === 'look') { looked.push(p.runId); return { ok: true }; }
      if (p.action === 'events') {
        if (looked.length === 1) await held;
        return { ok: true, events: [{ seq: 1, kind: 'signin', ...end }] };
      }
      return { ok: true };
    },
    stop: async () => {},
  };
  return { transport, looked, release: () => release() };
}
const supervisor = (clients) => {
  const sup = new Supervisor({ home, storeRoot: home, maxConcurrentSessions: 1, authProfiles: ['default'] }, { listItems: () => [], listProducts: () => [] }, '/nonexistent-app');
  sup._cloudClients = async () => ({ transport: clients.transport, storage });
  return sup;
};
const until = async (ok) => { for (let i = 0; i < 200 && !ok(); i += 1) await new Promise((r) => setTimeout(r, 5)); };

describe('Refresh during a look', () => {
  it('the reported case:Refresh pressed while the page’s own look runs reads every login once that look ends', async () => {
    const now = Date.now();
    recordCloudLogin('claude', 'acct-1', { id: 'id-1' }, { home, now: 1 });
    recordCloudLogin('claude', 'acct-2', { id: 'id-2', org: 'org-2', limits: [{ span: 'session', percent: 5, resetsAt: null }] }, { home, now });
    const c = cloud();
    const sup = supervisor(c);
    const opening = sup.lookAtCloudLogins();
    await until(() => c.looked.length === 1);
    const refresh = sup.lookAtCloudLogins({ force: true });
    c.release();
    await Promise.all([opening, refresh]);
    await until(() => c.looked.length === 3);
    expect(c.looked).toHaveLength(3);
  });

  it('must NOT start a second pass for a look that was not forced', async () => {
    recordCloudLogin('claude', 'acct-1', { id: 'id-1' }, { home, now: 1 });
    const c = cloud();
    const sup = supervisor(c);
    const opening = sup.lookAtCloudLogins();
    await until(() => c.looked.length === 1);
    const again = sup.lookAtCloudLogins();
    c.release();
    await Promise.all([opening, again]);
    await new Promise((r) => setTimeout(r, 30));
    expect(c.looked).toHaveLength(1);
  });
});

describe('a look that fails', () => {
  it('keeps the reading it had and says why on the account', async () => {
    recordCloudLogin('claude', 'acct-1', { id: 'id-1', org: 'org-1', limits: [{ span: 'session', percent: 100, resetsAt: null }] }, { home, now: 1_000 });
    const c = cloud({ state: 'failed', message: 'The cloud could not be reached. Try again.' });
    c.release();
    expect(await lookAtCloudLogin({ transport: c.transport, storage, key: 'acct-1', home, now: 5_000 })).toBe('failed');
    expect(cloudLoginFor('claude', 'acct-1', { home })).toMatchObject({ readAt: 1_000, lookFailedAt: 5_000, lookError: 'The cloud could not be reached. Try again.' });
    const [one] = supervisor(c)._cloudAccounts();
    expect([one.limits[0].percent, one.readError]).toEqual([100, 'The cloud could not be reached. Try again.']);
  });

  it('a failure with no words of its own still says one', async () => {
    recordCloudLogin('claude', 'acct-1', { id: 'id-1', org: 'org-1' }, { home, now: 1_000 });
    const c = cloud({ state: 'failed' });
    c.release();
    await lookAtCloudLogin({ transport: c.transport, storage, key: 'acct-1', home, now: 5_000 });
    expect(supervisor(c)._cloudAccounts()[0].readError).toMatch(/\S/);
  });

  it('must NOT say a failure once a later look has read it', async () => {
    recordCloudLogin('claude', 'acct-1', { id: 'id-1', org: 'org-1' }, { home, now: 1_000 });
    const failing = cloud({ state: 'failed', message: 'no' });
    failing.release();
    await lookAtCloudLogin({ transport: failing.transport, storage, key: 'acct-1', home, now: 5_000 });
    const reading = cloud();
    reading.release();
    await lookAtCloudLogin({ transport: reading.transport, storage, key: 'acct-1', home, now: 9_000 });
    expect(supervisor(reading)._cloudAccounts()[0].readError).toBeNull();
  });
});
