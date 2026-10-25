// What broke: nothing yet. The phone with the Mac shut (docs/cloud/PHONE-PLAN.md,
// step 1) is the app's own phone screens over a bridge to her rows online
// (renderer/src/cloud-bridge.ts), signing in as her (renderer/src/cloud-rest.ts).
// Measured on the bridge's own pieces with a fake database: what the inbox
// draws from the rows, what each press leaves for her Mac, that a reply shows
// as waiting until her Mac takes it, and that every request carries her
// sign-in and no other key.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { phoneView, phoneHistory, commandFor, readCloudConfig, phoneSlug, splitSlug, closeToTakeBack, UNDONE } from '../renderer/src/cloud-bridge';
import { REQUEST_CHANNELS } from '../shared/bridge-map.mjs';
import { cloudClient } from '../renderer/src/cloud-rest';

const NOW = Date.parse('2026-10-14T12:00:00Z');
const iso = (ms) => new Date(ms).toISOString();
const DEV = 'a1b2c3d4e5f6';
const OTHER = '0f0e0d0c0b0a';
const A = phoneSlug(DEV, 'alpha');
const thread = (item, extra = {}) => ({ device: DEV, project: 'alpha', item, snapshot: { v: 2, item: { id: item, title: `T ${item}`, status: 'blocked', updatedAt: NOW - 1e5, ...extra }, history: [{ id: item, ts: 1, source: 'agent', patch: { result: 'Done.' } }] } });
const cmd = (id, kind, extra = {}) => ({ id, device: DEV, project: 'alpha', item: 'w-1', kind, payload: {}, created_at: iso(NOW - 1000), taken_at: null, outcome: null, ...extra });
const rows = (commands = []) => ({ projects: [{ device: DEV, project: 'alpha', name: 'Alpha' }], threads: [thread('w-1'), thread('w-2')], commands });

describe('what the inbox draws', () => {
  it('each thread as her Mac last saw it, under its project', () => {
    const v = phoneView(rows(), NOW);
    expect(v.products.map((p) => [p.slug, p.name])).toEqual([[A, 'Alpha']]);
    expect(v.items.map((i) => [i.id, i.product, i.productName, i.status])).toEqual([['w-1', A, 'Alpha', 'blocked'], ['w-2', A, 'Alpha', 'blocked']]);
    expect(phoneHistory(rows(), A, 'w-1').lines[0].patch.result).toBe('Done.');
    expect(phoneHistory(rows(), A, 'w-9').lines).toEqual([]);
  });

  it('two computers\' projects of the same name are two projects', () => {
    const r = rows();
    r.projects.push({ device: OTHER, project: 'alpha', name: 'Alpha at home' });
    r.threads.push({ ...thread('w-1'), device: OTHER });
    const v = phoneView(r, NOW);
    expect(v.products.map((p) => p.name)).toEqual(['Alpha', 'Alpha at home']);
    expect(v.items.filter((i) => i.title === 'T w-1').map((i) => i.productName).sort()).toEqual(['Alpha', 'Alpha at home']);
    expect(commandFor('zero:answer', { product: phoneSlug(OTHER, 'alpha'), id: 'w-1', answer: 'hi' })).toMatchObject({ device: OTHER, project: 'alpha' });
    expect(splitSlug('alpha')).toBeNull();
    expect(splitSlug('my@project@a1b2c3d4e5f6')).toEqual({ project: 'my@project', device: 'a1b2c3d4e5f6' });
  });

  it('a thread of a project no longer on her phone is not drawn', () => {
    const r = rows();
    r.threads.push({ ...thread('w-3'), project: 'gone' });
    expect(phoneView(r, NOW).items.map((i) => i.id)).toEqual(['w-1', 'w-2']);
  });

  it('a close or a snooze waiting for her Mac moves the row at once', () => {
    const v = phoneView(rows([cmd('c1', 'close'), cmd('c2', 'snooze', { item: 'w-2', payload: { until: NOW + 864e5 } })]), NOW);
    expect(v.items.find((i) => i.id === 'w-1').status).toBe('done');
    expect(v.items.find((i) => i.id === 'w-2').snoozedUntil).toBe(NOW + 864e5);
  });

  it('a new thread waiting for her Mac is a row of its own', () => {
    const v = phoneView(rows([cmd('0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', 'new', { item: null, payload: { title: 'Ship it', body: 'today' } })]), NOW);
    const made = v.items.find((i) => i.title === 'Ship it');
    expect(made).toMatchObject({ product: A, status: 'open', waitsForMac: true });
    expect(made.id).toMatch(/^w-[0-9a-f]{10}$/);
  });

  it('a reply waits, then goes once her Mac has taken it and sent the thread again', () => {
    expect(phoneView(rows([cmd('c1', 'reply', { payload: { text: 'Yes, ship it.' } })]), NOW).waiting)
      .toEqual([{ product: A, id: 'w-1', at: NOW - 1000, text: 'Yes, ship it.' }]);
    const taken = rows([cmd('c1', 'reply', { payload: { text: 'x' }, taken_at: iso(NOW), outcome: 'done' })]);
    expect(phoneView({ ...taken, threads: taken.threads.map((t) => ({ ...t, updated_at: iso(NOW + 1) })) }, NOW).waiting).toEqual([]);
  });

  it('a reply still waiting is shown however old it is', () => {
    const old = cmd('c1', 'reply', { payload: { text: 'from last week' }, created_at: iso(NOW - 9 * 864e5) });
    expect(phoneView(rows([old]), NOW).waiting.map((w) => w.text)).toEqual(['from last week']);
  });

  // Codex's second review, finding 6: the same thread id on two computers.
  it('the same thread id on two computers is two rows, each acted on where it lives', () => {
    const r = rows();
    r.projects.push({ device: OTHER, project: 'alpha', name: 'Alpha at home' });
    r.threads.push({ ...thread('w-1'), device: OTHER });
    const v = phoneView(r, NOW);
    const ids = v.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    const both = v.items.filter((i) => i.title === 'T w-1');
    expect(both.filter((i) => i.id === 'w-1')).toHaveLength(1);
    for (const row of both) {
      const device = splitSlug(row.product).device;
      expect(commandFor('zero:answer', { product: row.product, id: row.id, status: 'done' }, v.aliases)).toEqual({ device, project: 'alpha', item: 'w-1', kind: 'close', payload: {} });
      expect(phoneHistory(r, row.product, row.id, v.aliases).lines[0]).toMatchObject({ id: row.id, patch: { result: 'Done.' } });
    }
    // A reply waiting on one is drawn on that one's row only.
    const home = both.find((i) => i.productName === 'Alpha at home');
    r.commands.push({ ...cmd('c9', 'reply', { payload: { text: 'home only' } }), device: OTHER });
    expect(phoneView(r, NOW).waiting.map((w) => [w.product, w.id])).toEqual([[home.product, home.id]]);
  });

  // Finding 9: refusals aged by when the command was made, not when it was refused.
  it('an old reply refused just now shows why, and so does a close, a Later or a new thread', () => {
    const old = iso(NOW - 3 * 864e5);
    const v = phoneView(rows([
      cmd('c1', 'reply', { payload: { text: 'from last week' }, created_at: old, taken_at: iso(NOW - 1000), outcome: 'refused: that thread is not on your phone' }),
      cmd('c2', 'close', { created_at: old, taken_at: iso(NOW - 1000), outcome: 'refused: it is running' }),
      cmd('c3', 'snooze', { payload: { until: NOW + 864e5 }, taken_at: iso(NOW - 1000), outcome: 'refused: no' }),
      cmd('0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', 'new', { item: null, payload: { title: 'Ship it' }, taken_at: iso(NOW - 1000), outcome: 'refused: no room' }),
    ]), NOW);
    expect(v.waiting.map((w) => [w.text, w.refused])).toEqual([
      ['from last week', 'that thread is not on your phone'],
      ['Close this thread', 'it is running'],
      ['Move to Later', 'no'],
    ]);
    expect(v.items.find((i) => i.title === 'Ship it')).toMatchObject({ status: 'blocked', result: 'Your computer could not start this: no room' });
  });

  it('a reply her Mac turned down says why, for a day', () => {
    const refused = cmd('c1', 'reply', { payload: { text: 'x' }, taken_at: iso(NOW), outcome: 'refused: that thread is not on your phone' });
    expect(phoneView(rows([refused]), NOW).waiting[0].refused).toBe('that thread is not on your phone');
    expect(phoneView(rows([refused]), NOW + 2 * 864e5).waiting).toEqual([]);
    // A close her Mac turned down leaves the row where it was.
    const noClose = cmd('c2', 'close', { taken_at: iso(NOW), outcome: 'refused: no' });
    expect(phoneView(rows([noClose]), NOW).items.find((i) => i.id === 'w-1').status).toBe('blocked');
  });
});

describe('undo on the phone', () => {
  it('takes back a close still waiting, and the row comes back', () => {
    const close = cmd('c1', 'close');
    const r = rows([close]);
    expect(closeToTakeBack(r, 'zero:answer', { product: A, id: 'w-1', status: 'open' })?.id).toBe('c1');
    const undone = rows([{ ...close, taken_at: iso(NOW), outcome: UNDONE }]);
    expect(phoneView(undone, NOW).items.find((i) => i.id === 'w-1').status).toBe('blocked');
  });
  it('leaves alone a close the computer already did, a reply, and another thread', () => {
    expect(closeToTakeBack(rows([cmd('c1', 'close', { taken_at: iso(NOW), outcome: 'done' })]), 'zero:answer', { product: A, id: 'w-1', status: 'open' })).toBeNull();
    expect(closeToTakeBack(rows([cmd('c1', 'close')]), 'zero:answer', { product: A, id: 'w-2', status: 'open' })).toBeNull();
    expect(closeToTakeBack(rows([cmd('c1', 'close')]), 'zero:answer', { product: A, id: 'w-1', status: 'open', answer: 'more' })).toBeNull();
  });
});

describe('the third review', () => {
  // Finding 6: a stand-in id landed on a real one.
  it('a stand-in id is never a real thread\'s id, nor a new thread\'s waiting on the phone', () => {
    const r = { projects: [{ device: 'aaaaaaaaaaaa', project: 'p', name: 'P' }, { device: 'bbbbbbbbbbbb', project: 'p', name: 'P2' }], threads: [], commands: [] };
    r.threads.push({ ...thread('w-1234567890'), device: 'aaaaaaaaaaaa', project: 'p' }, { ...thread('w-1234567890'), device: 'bbbbbbbbbbbb', project: 'p' });
    const first = phoneView(r, NOW);
    const stand = first.items.find((i) => i.id !== 'w-1234567890').id;
    // Now a real thread with exactly that id appears.
    r.threads.push({ ...thread(stand), device: 'aaaaaaaaaaaa', project: 'p' });
    const ids = phoneView(r, NOW).items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  // Finding 3: Undo only before the computer claims it.
  it('Undo takes back nothing the computer has claimed', () => {
    expect(closeToTakeBack(rows([cmd('c1', 'close', { claimed_at: iso(NOW) })]), 'zero:answer', { product: A, id: 'w-1', status: 'open' })).toBeNull();
    const src = fs.readFileSync(new URL('../renderer/src/phone-send.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/taken_at=is\.null&claimed_at=is\.null/);
  });
});

describe('what a press leaves for her Mac', () => {
  it('the things it may ask, and nothing else', () => {
    expect(commandFor('zero:answer', { product: A, id: 'w-1', answer: 'Yes' })).toEqual({ device: DEV, project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: 'Yes' } });
    expect(commandFor('zero:answer', { product: A, id: 'w-1', status: 'done' })).toEqual({ device: DEV, project: 'alpha', item: 'w-1', kind: 'close', payload: {} });
    expect(commandFor('zero:snooze', { product: A, id: 'w-1', snoozedUntil: 5 })).toEqual({ device: DEV, project: 'alpha', item: 'w-1', kind: 'snooze', payload: { until: 5 } });
    expect(commandFor('zero:compose', { product: A, title: 'T', body: 'B' })).toEqual({ device: DEV, project: 'alpha', item: null, kind: 'new', payload: { title: 'T', body: 'B' } });
    expect(commandFor('zero:answer', { product: A, id: 'w-1', answer: '  ' })).toBeNull();
    expect(commandFor('zero:answer', { product: A, id: 'w-1', priority: 9 })).toBeNull();
    expect(commandFor('zero:snooze', { product: A, id: 'w-1', snoozedUntil: null })).toBeNull();
    expect(commandFor('zero:snooze', { product: A, id: 'w-1', snoozedUntil: 0 })).toMatchObject({ kind: 'snooze', payload: { until: 0 } });
    // A project not known as one computer's is no command at all.
    expect(commandFor('zero:answer', { product: 'alpha', id: 'w-1', answer: 'hi' })).toBeNull();
    expect(commandFor('zero:compose', { product: A, title: ' ', body: '' })).toBeNull();
    expect(commandFor('zero:command', { product: A, id: 'w-1', text: '/usage' })).toBeNull();
  });
});

describe('signing in and asking, as her', () => {
  const cfg = { url: 'https://db.example.test', anonKey: 'public-anon' };
  const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
  const answer = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('signs in with a password, then asks with her token and the public key only', async () => {
    const seen = [];
    let t = NOW;
    const fetchImpl = async (url, init) => {
      seen.push({ url, headers: init.headers, body: init.body });
      if (url.includes('grant_type=password')) return answer(200, { access_token: 'tok-1', refresh_token: 'r-1', expires_in: 3600, user: { id: 'u-1', email: 'a@b.c' } });
      if (url.includes('grant_type=refresh_token')) return answer(200, { access_token: 'tok-2', refresh_token: 'r-2', expires_in: 3600, user: { id: 'u-1' } });
      return answer(200, [{ project: 'alpha', name: 'Alpha' }]);
    };
    const storage = memory();
    const c = cloudClient(cfg, { storage, fetchImpl, now: () => t });
    await c.signInWithPassword('a@b.c', 'pw');
    expect(await c.select('phone_projects', 'select=project,name')).toEqual([{ project: 'alpha', name: 'Alpha' }]);
    expect(seen[1].headers).toMatchObject({ apikey: 'public-anon', authorization: 'Bearer tok-1' });
    // Near its end the token is renewed first.
    t = NOW + 3600_000 - 30_000;
    await c.select('phone_threads', 'select=item');
    expect(seen.at(-2).url).toContain('grant_type=refresh_token');
    expect(seen.at(-1).headers.authorization).toBe('Bearer tok-2');
    // Kept for the next visit, and gone on sign-out.
    expect(cloudClient(cfg, { storage, fetchImpl }).signedIn()).toBe(true);
    c.signOut();
    expect(cloudClient(cfg, { storage, fetchImpl }).signedIn()).toBe(false);
  });

  it('signs in with Google through a one-time proof, and refuses a code it did not start', async () => {
    const storage = memory();
    let sent = null;
    const fetchImpl = async (url, init) => { sent = { url, body: JSON.parse(init.body) }; return answer(200, { access_token: 'tok', refresh_token: 'r', expires_in: 3600, user: { id: 'u-1' } }); };
    const c = cloudClient(cfg, { storage, fetchImpl });
    const go = new URL(await c.googleUrl('https://phone.example.test/'));
    expect(go.pathname).toBe('/auth/v1/authorize');
    expect(go.searchParams.get('provider')).toBe('google');
    expect(go.searchParams.get('code_challenge_method')).toBe('s256');
    await c.finishGoogle('code-1');
    expect(sent.url).toContain('grant_type=pkce');
    expect(sent.body.auth_code).toBe('code-1');
    expect(sent.body.code_verifier).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    await expect(cloudClient(cfg, { storage: memory(), fetchImpl }).finishGoogle('code-2')).rejects.toThrow(/started somewhere else/);
  });

  // Codex's review of step 1, finding 6.
  it('a renewal still in flight when she signs out does not sign her back in', async () => {
    const storage = memory();
    storage.setItem('agentbox-cloud-session', JSON.stringify({ access_token: 'old', refresh_token: 'r', expires_at: NOW + 10_000, user: { id: 'u-1' } }));
    let release;
    const fetchImpl = async (url) => {
      if (url.includes('grant_type=refresh_token')) { await new Promise((z) => { release = z; }); return answer(200, { access_token: 'new', refresh_token: 'r2', expires_in: 3600, user: { id: 'u-1' } }); }
      return answer(200, []);
    };
    const c = cloudClient(cfg, { storage, fetchImpl, now: () => NOW });
    const asking = c.select('phone_threads', 'select=item').catch((e) => e);
    await new Promise((z) => setTimeout(z, 0));
    c.signOut();
    release();
    await asking;
    expect(c.signedIn()).toBe(false);
    expect(storage.getItem('agentbox-cloud-session')).toBeNull();
  });

  it('a renewal the database refuses signs her out, and two at once ask once', async () => {
    const storage = memory();
    storage.setItem('agentbox-cloud-session', JSON.stringify({ access_token: 'old', refresh_token: 'r', expires_at: NOW + 10_000, user: { id: 'u-1' } }));
    let asked = 0;
    const c = cloudClient(cfg, { storage, now: () => NOW, fetchImpl: async (url) => {
      if (url.includes('grant_type=refresh_token')) { asked += 1; return answer(400, { error_description: 'Invalid Refresh Token' }); }
      return answer(200, []);
    } });
    const both = await Promise.all([c.select('a', 'x').catch((e) => e.message), c.select('b', 'y').catch((e) => e.message)]);
    expect(both).toEqual(['Invalid Refresh Token', 'Invalid Refresh Token']);
    expect(asked).toBe(1);
    expect(c.signedIn()).toBe(false);
  });

  it('a refused sign-in says why in words, and a lapsed one signs her out', async () => {
    const c = cloudClient(cfg, { storage: memory(), fetchImpl: async () => answer(400, { error_description: 'Invalid login credentials' }) });
    await expect(c.signInWithPassword('a@b.c', 'no')).rejects.toThrow('Invalid login credentials');
    const storage = memory();
    storage.setItem('agentbox-cloud-session', JSON.stringify({ access_token: 't', refresh_token: 'r', expires_at: Date.now() + 3600_000, user: { id: 'u' } }));
    const d = cloudClient(cfg, { storage, fetchImpl: async () => answer(401, { message: 'JWT expired' }) });
    await expect(d.select('phone_threads', 'select=item')).rejects.toThrow('JWT expired');
    expect(d.signedIn()).toBe(false);
  });
});

// Codex's review of step 1, finding 7: Stop answered as if it had stopped.
describe('the doors the phone does not have', () => {
  it('every door is either one it may ask, a read, sign-in, or says it is not here', () => {
    const src = fs.readFileSync(new URL('../renderer/src/cloud-bridge.ts', import.meta.url), 'utf8');
    const reads = [...src.slice(src.indexOf('const READS = new Set(['), src.indexOf(']);', src.indexOf('const READS'))).matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1]);
    for (const door of ['stopSession', 'runNow', 'reopen', 'schedule', 'sendNow', 'command', 'approve', 'agentReply', 'saveAttachments', 'setProjectSetting', 'threadEdit', 'createProduct', 'resumeAgents', 'resumeItems', 'agentUpdate']) {
      expect(reads, door).not.toContain(door);
      expect(Object.keys(REQUEST_CHANNELS)).toContain(door);
    }
    expect(src).toMatch(/READS\.has\(name\) \? async \(\) => null : async \(\) => \{ throw new Error\(NOT_HERE\); \}/);
    // Asking whether an agent has an update is a read; starting one is not.
    expect(src).toMatch(/agentUpdate: async \(p: any\) => \{ if \(p\?\.action === 'start'\) throw new Error\(NOT_HERE\); return null; \}/);
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    // A stop from the phone says it was sent, not that it stopped.
    expect(app).toMatch(/showToast\('Stop sent\. Your Mac stops the agent when it gets it\.'\)/);
  });
});

describe('only on its own site', () => {
  it('reads the cloud address from the page, and nothing from a page without it', () => {
    const doc = (content) => ({ querySelector: () => (content == null ? null : { getAttribute: () => content }) });
    expect(readCloudConfig(doc(JSON.stringify({ url: 'https://db', anonKey: 'k' })))).toEqual({ url: 'https://db', anonKey: 'k' });
    expect(readCloudConfig(doc(null))).toBeNull();
    expect(readCloudConfig(doc('not json'))).toBeNull();
  });
  it('is never put in the page the desktop or the Mac\'s own phone page loads', () => {
    expect(fs.readFileSync(new URL('../renderer/index.html', import.meta.url), 'utf8')).not.toContain('agentbox-cloud');
  });
});
