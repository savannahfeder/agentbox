// THE PHONE SAYS WHEN WHAT IT SHOWS IS OUT OF DATE, AND KEEPS HER SIGNED IN.
//
// What broke (found reading the code, 2026-10-19):
// - offline, or with the database failing, the hosted phone drew the inbox it
//   last had as if it were now: its error reached the screen only on the
//   sign-in page;
// - nothing said her Mac had been away for days, so "Waiting for your
//   computer" could mean a minute or a week;
// - any 401 threw her sign-in away without trying the renewal it holds, and a
//   second tab that had renewed first left this one with a spent token;
// - one file that could not be fetched for one reply stopped the Mac's whole
//   pass, so no other command was taken and no thread was sent.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { phoneStatusLine, macSeenOf } from '../renderer/src/cloud-bridge';
import { cloudClient } from '../renderer/src/cloud-rest';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';
import { createPhoneInbox } from '../main/phone-inbox.mjs';

const NOW = Date.parse('2026-10-19T12:00:00Z');
const MIN = 60_000;

describe('the line over her inbox', () => {
  it('says the inbox online cannot be reached, and how old what she sees is', () => {
    expect(phoneStatusLine({ error: 'Failed to fetch', fetchedAt: NOW - 7 * MIN, macSeen: NOW - MIN }, NOW)).toBe('Can\'t reach your inbox online. This is how it was 7 minutes ago.');
    expect(phoneStatusLine({ error: 'Failed to fetch', fetchedAt: 0, macSeen: 0 }, NOW)).toBe('Can\'t reach your inbox online.');
  });

  it('says when her computer was last online, once it has been away a while', () => {
    expect(phoneStatusLine({ error: null, fetchedAt: NOW, macSeen: NOW - 3 * 24 * 60 * MIN }, NOW)).toBe('Your computer was last online 3 days ago. What you send waits for it.');
    expect(phoneStatusLine({ error: null, fetchedAt: NOW, macSeen: NOW - 40 * MIN }, NOW)).toBe('Your computer was last online 40 minutes ago. What you send waits for it.');
    expect(phoneStatusLine({ error: null, fetchedAt: NOW, macSeen: NOW - MIN }, NOW)).toBe(null);
    // No computer has ever put anything here: the inbox asks for one instead
    // (tests/the-web-app-says-when-no-computer-has-connected.test.mjs).
    expect(phoneStatusLine({ error: null, fetchedAt: NOW, macSeen: 0 }, NOW)).toBe(null);
  });

  it('counts the newest of her computers', () => {
    expect(macSeenOf([{ device: 'a', updated_at: new Date(NOW - 5 * MIN).toISOString() }, { device: 'b', updated_at: new Date(NOW - 50 * MIN).toISOString() }, { device: 'c' }])).toBe(NOW - 5 * MIN);
    expect(macSeenOf([])).toBe(0);
  });
});

describe('her Mac', () => {
  it('says it is still there every thirty seconds, even with nothing new to send', async () => {
    const cloud = createMemoryCloud();
    let now = NOW;
    cloud.now = () => now;
    const me = signUpMemory(cloud, { email: `o-${Math.random()}@example.com` });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-beat-'));
    const inbox = createPhoneInbox({
      backend: memoryBackend(cloud, me), projects: () => [{ slug: 'alpha', name: 'Alpha' }], listItems: () => [], historyOf: () => [],
      apply: async () => {}, stateFile: path.join(dir, 's.json'), home: '/Users/someone', now: () => now,
    });
    const seen = async () => (await memoryBackend(cloud, me).phoneProjects())[0].updatedAt;
    await inbox.syncOnce();
    expect(await seen()).toBe(NOW);
    now += 29_999;
    await inbox.syncOnce();
    expect(await seen()).toBe(NOW);
    now += 1;
    await inbox.syncOnce();
    expect(await seen()).toBe(NOW + 30_000);
  });

  it('takes the other commands when one reply\'s file cannot be fetched just now, and that one next time', async () => {
    const cloud = createMemoryCloud();
    cloud.now = () => NOW;
    const me = signUpMemory(cloud, { email: `o-${Math.random()}@example.com` });
    const mac = memoryBackend(cloud, me);
    const phone = memoryBackend(cloud, me);
    let down = true;
    const flaky = { ...mac, getPhoneFile: async (a) => { if (down) throw new Error('network down'); return mac.getPhoneFile(a); } };
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-flaky-'));
    const applied = [];
    const inbox = createPhoneInbox({
      backend: flaky, projects: () => [{ slug: 'alpha', name: 'Alpha', dir }], listItems: () => [{ id: 'w-1', title: 'T', status: 'open', updatedAt: NOW - 1000 }],
      historyOf: (s, id) => [{ id, ts: NOW, source: 'founder', patch: { body: 'b' } }], apply: async (c) => { applied.push(c.payload.text); },
      stateFile: path.join(dir, 's.json'), home: '/Users/someone', now: () => NOW,
    });
    const name = `${'a'.repeat(64)}.txt`;
    await phone.putPhoneFile({ device: inbox.device, name, data: Buffer.from('x') });
    await phone.addPhoneCommand({ device: inbox.device, project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: `see [f.txt](phone-files/${name})` } });
    await phone.addPhoneCommand({ device: inbox.device, project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: 'and this' } });
    const pass = await inbox.syncOnce();
    expect(applied).toEqual(['and this']);
    expect(pass.sent).toBe(1);
    down = false;
    await inbox.syncOnce();
    // Refused next time only for being the wrong file; the point is it was tried again.
    expect((await phone.phoneCommands()).every((c) => c.takenAt)).toBe(true);
  });
});

describe('her sign-in', () => {
  const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), m }; };
  const ok = (body) => ({ ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body });
  const no = (status, body = { message: 'JWT expired' }) => ({ ok: false, status, text: async () => JSON.stringify(body), json: async () => body });
  const session = (token, refresh, expiresAt) => JSON.stringify({ access_token: token, refresh_token: refresh, expires_at: expiresAt, user: { id: 'u-1' } });

  it('renews once and asks again when the database says its token has run out', async () => {
    const s = store();
    s.setItem('agentbox-cloud-session', session('old', 'r1', NOW + 30 * MIN));
    const asked = [];
    const fetchImpl = async (url, init) => {
      asked.push([url.replace('https://x.example', ''), init.headers?.authorization ?? null]);
      if (url.includes('grant_type=refresh_token')) return ok({ access_token: 'new', refresh_token: 'r2', expires_in: 3600, user: { id: 'u-1' } });
      return init.headers.authorization === 'Bearer old' ? no(401) : ok([{ id: 1 }]);
    };
    const client = cloudClient({ url: 'https://x.example', anonKey: 'k' }, { storage: s, fetchImpl, now: () => NOW });
    expect(await client.select('phone_projects', 'select=name')).toEqual([{ id: 1 }]);
    expect(client.signedIn()).toBe(true);
    expect(asked.map((a) => a[1])).toEqual(['Bearer old', null, 'Bearer new']);
  });

  it('still signs her out when the renewal itself is refused', async () => {
    const s = store();
    s.setItem('agentbox-cloud-session', session('old', 'r1', NOW + 30 * MIN));
    const fetchImpl = async (url) => (url.includes('grant_type=refresh_token') ? no(400, { error_description: 'Invalid Refresh Token' }) : no(401));
    const client = cloudClient({ url: 'https://x.example', anonKey: 'k' }, { storage: s, fetchImpl, now: () => NOW });
    await expect(client.select('phone_projects', 'select=name')).rejects.toThrow();
    expect(client.signedIn()).toBe(false);
  });

  it('takes the sign-in another tab renewed, rather than spending its own old one', async () => {
    const s = store();
    s.setItem('agentbox-cloud-session', session('old', 'r1', NOW + 30 * 1000));
    const asked = [];
    const fetchImpl = async (url, init) => { asked.push(url.includes('refresh_token') ? 'renew' : init.headers.authorization); return ok([]); };
    const client = cloudClient({ url: 'https://x.example', anonKey: 'k' }, { storage: s, fetchImpl, now: () => NOW });
    // The other tab renewed: its session is in the shared store now.
    s.setItem('agentbox-cloud-session', session('fresh', 'r2', NOW + 60 * MIN));
    await client.select('phone_projects', 'select=name');
    expect(asked).toEqual(['Bearer fresh']);
  });
});

describe('the bridge', () => {
  it('never starts a read while the last one is still out', () => {
    const src = fs.readFileSync(new URL('../renderer/src/cloud-bridge.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/if \(reading\) return reading;/);
  });
});

// A reply her Mac had taken left the screen at once, and stayed gone until
// the thread's next copy arrived, which a copy in retry could hold back an hour.
describe('a reply her Mac has taken', () => {
  it('stays on the screen until a copy of the thread from after it arrives, for two hours at most', async () => {
    const { phoneView, phoneSlug } = await import('../renderer/src/cloud-bridge');
    const DEV = 'a1b2c3d4e5f6';
    const iso = (ms) => new Date(ms).toISOString();
    const thread = (updated) => ({ device: DEV, project: 'alpha', item: 'w-1', updated_at: iso(updated), snapshot: { v: 3, item: { id: 'w-1', title: 'T', status: 'blocked', updatedAt: updated }, history: [] } });
    const reply = { id: 'c1', device: DEV, project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: 'go' }, created_at: iso(NOW - 3 * MIN), claimed_at: iso(NOW - 2 * MIN), taken_at: iso(NOW - 2 * MIN), outcome: 'done' };
    const view = (t, now = NOW) => phoneView({ projects: [{ device: DEV, project: 'alpha', name: 'Alpha' }], threads: [t], commands: [reply] }, now);
    expect(view(thread(NOW - 10 * MIN)).waiting.map((w) => w.text)).toEqual(['go']);
    expect(view(thread(NOW - MIN)).waiting).toEqual([]);
    expect(view(thread(NOW - 10 * MIN), NOW + 3 * 60 * MIN).waiting).toEqual([]);
    expect(phoneSlug(DEV, 'alpha')).toBe('alpha@a1b2c3d4e5f6');
  });
});
