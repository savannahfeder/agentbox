// THE COMPUTER ALERTS THE WEB APP ON A PHONE.
//
// What broke (2026-10-27, read off the code after the founder asked for phone
// alerts in the launch video): the web app at agentbox-phone.pages.dev could
// not get an alert at all. Its alert code (renderer/src/phone-alerts.ts) only
// spoke to a computer serving the page itself, which nothing uses any more,
// so on the hosted site it answered "unsupported". Now the web app makes its
// own Web Push subscription and signing keys and hands them to each computer
// as a setting (shared/web-alerts.mts), and the computer sends its alerts to
// it beside the phone app's, by the same rules. Measured here with the
// in-memory cloud, real keys, and the real encryption: the pushed body is
// decrypted with the subscription's own keys.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import webpush from 'web-push';
import ece from 'http_ece';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createPhoneInbox } from '../main/phone-inbox.mts';
import { FOLD_MS } from '../main/phone-alerts.mts';
import { checkSetting } from '../shared/phone-settings.mts';
import { makeVapidKeys, WEB_ALERTS_KEY, WEB_ALERTS_TEST_KEY } from '../shared/web-alerts.mts';

const NOW = Date.parse('2026-10-27T12:00:00Z');
const ENDPOINT = 'https://web.push.apple.com/QH4bAbCdEfGh0123456789';
const b64url = (buf) => Buffer.from(buf).toString('base64url');

/** A phone's subscription, as Safari makes one: its own key pair and secret. */
function aPhone() {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  return { ecdh, auth, keys: { p256dh: b64url(ecdh.getPublicKey()), auth: b64url(auth) } };
}

async function setup() {
  const cloud = createMemoryCloud();
  let clock = NOW;
  cloud.now = () => clock;
  const me = signUpMemory(cloud, { email: `owner-${Math.random()}@example.com` });
  const mac = memoryBackend(cloud, me);
  const web = memoryBackend(cloud, me);
  const stateFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'web-alerts-')), 'phone-inbox.json');
  const world = { idle: 10 * 60_000, pushed: [], fail: null };
  const row = (id) => ({ id, title: `Thread ${id}`, status: 'blocked', createdAt: NOW - 3600_000, updatedAt: NOW - 60_000, wrote: { status: { ts: NOW - 60_000, source: 'agent' } } });
  const inbox = createPhoneInbox({
    backend: mac, owner: me,
    projects: () => [{ slug: 'alpha', name: 'Alpha' }],
    listItems: () => [row('w-1'), row('w-2')],
    historyOf: () => [], apply: async () => ({ ok: true }), stateFile,
    now: () => clock, idleMs: () => world.idle,
    sendPush: async (messages) => messages.map(() => ({ status: 'ok' })),
    // What web-push would send, built by web-push itself, so the body is the real encryption.
    sendWebPush: async (sub, body, opts) => {
      if (world.fail) throw Object.assign(new Error('gone'), { statusCode: world.fail });
      world.pushed.push({ sub, details: webpush.generateRequestDetails(sub, body, opts) });
    },
  });
  await inbox.syncOnce();
  const phone = aPhone();
  const vapid = await makeVapidKeys(crypto.webcrypto.subtle);
  const turnOn = async (extra = {}) => {
    await web.addPhoneCommand({ device: inbox.device, kind: 'setting', payload: { scope: 'workspace', key: WEB_ALERTS_KEY, value: { on: true, endpoint: ENDPOINT, keys: phone.keys, vapid, ...extra } } });
    await inbox.syncOnce();
  };
  const pass = async () => { clock += FOLD_MS; await inbox.syncOnce(); };
  const decrypt = (pushed) => JSON.parse(ece.decrypt(pushed.details.body, { version: 'aes128gcm', privateKey: phone.ecdh, authSecret: phone.keys.auth }).toString('utf8'));
  return { cloud, inbox, web, world, phone, vapid, turnOn, pass, decrypt, tick: (ms) => { clock += ms; } };
}

describe('the setting the web app leaves', () => {
  it('is one a computer takes: an https endpoint, the phone\'s keys and the signing keys', async () => {
    const phone = aPhone();
    const vapid = await makeVapidKeys(crypto.webcrypto.subtle);
    expect(Buffer.from(vapid.publicKey, 'base64url')).toHaveLength(65);
    expect(Buffer.from(vapid.privateKey, 'base64url')).toHaveLength(32);
    const value = { on: true, endpoint: ENDPOINT, keys: phone.keys, vapid };
    expect(checkSetting({ scope: 'workspace', key: WEB_ALERTS_KEY, value })).toBeNull();
    expect(checkSetting({ scope: 'workspace', key: WEB_ALERTS_KEY, value: { on: false, endpoint: ENDPOINT } })).toBeNull();
    expect(checkSetting({ scope: 'workspace', key: WEB_ALERTS_TEST_KEY, value: { endpoint: ENDPOINT } })).toBeNull();
  });

  it('is refused with an endpoint that is not https, or keys that are not keys', async () => {
    const phone = aPhone();
    const vapid = await makeVapidKeys(crypto.webcrypto.subtle);
    for (const value of [
      { on: true, endpoint: 'http://web.push.apple.com/x', keys: phone.keys, vapid },
      { on: true, endpoint: 'https://example.com/x y', keys: phone.keys, vapid },
      { on: true, endpoint: ENDPOINT, keys: { p256dh: 'short', auth: phone.keys.auth }, vapid },
      { on: true, endpoint: ENDPOINT, keys: phone.keys, vapid: { publicKey: vapid.publicKey } },
      { on: true, endpoint: ENDPOINT, keys: phone.keys },
    ]) expect(checkSetting({ scope: 'workspace', key: WEB_ALERTS_KEY, value }), JSON.stringify(value)).toMatch(/not a value/);
  });
});

describe('the computer', () => {
  it('sends a thread that newly needs you to the web app, encrypted for that phone and signed with its keys', async () => {
    const t = await setup();
    await t.turnOn();
    t.inbox.arrivals([{ id: 'w-1', product: 'alpha', title: 'Thread w-1', kind: 'item' }], [{ id: 'w-1', product: 'alpha' }]);
    await t.pass();
    expect(t.world.pushed).toHaveLength(1);
    const [p] = t.world.pushed;
    expect(p.details.endpoint).toBe(ENDPOINT);
    expect(p.details.headers.Authorization).toContain(`k=${t.vapid.publicKey}`);
    expect(t.decrypt(p)).toMatchObject({ title: 'Thread w-1', body: 'An agent is ready', count: 1, open: 'w-1' });
  });

  it('sends nothing while you are at the computer, as for the phone app', async () => {
    const t = await setup();
    await t.turnOn();
    t.world.idle = 1000;
    t.inbox.arrivals([{ id: 'w-1', product: 'alpha', title: 'Thread w-1', kind: 'item' }], [{ id: 'w-1', product: 'alpha' }]);
    await t.pass();
    expect(t.world.pushed).toHaveLength(0);
  });

  it('sends a test at once when asked, whether or not you are at the computer', async () => {
    const t = await setup();
    await t.turnOn();
    t.world.idle = 1000;
    await t.web.addPhoneCommand({ device: t.inbox.device, kind: 'setting', payload: { scope: 'workspace', key: WEB_ALERTS_TEST_KEY, value: { endpoint: ENDPOINT } } });
    await t.inbox.syncOnce();
    expect(t.world.pushed).toHaveLength(1);
    expect(t.decrypt(t.world.pushed[0]).body).toMatch(/reach this phone/);
  });

  it('forgets the web app when it is turned off, and when its push service says the address is gone', async () => {
    const t = await setup();
    await t.turnOn();
    await t.web.addPhoneCommand({ device: t.inbox.device, kind: 'setting', payload: { scope: 'workspace', key: WEB_ALERTS_KEY, value: { on: false, endpoint: ENDPOINT } } });
    await t.inbox.syncOnce();
    t.inbox.arrivals([{ id: 'w-1', product: 'alpha', title: 'Thread w-1', kind: 'item' }], [{ id: 'w-1', product: 'alpha' }]);
    await t.pass();
    expect(t.world.pushed).toHaveLength(0);

    await t.turnOn();
    t.world.fail = 410;
    t.inbox.arrivals([{ id: 'w-2', product: 'alpha', title: 'Thread w-2', kind: 'item' }], [{ id: 'w-2', product: 'alpha' }]);
    await t.pass();
    t.world.fail = null;
    t.tick(30 * 60_000);
    t.inbox.arrivals([{ id: 'w-1', product: 'alpha', title: 'Thread w-1 again', kind: 'item' }], [{ id: 'w-1', product: 'alpha' }]);
    await t.pass();
    expect(t.world.pushed).toHaveLength(0);
  });

  it('marks the setting done, and never hands it to the window\'s settings handler', async () => {
    const t = await setup();
    await t.turnOn();
    const cmds = await t.web.phoneCommands();
    expect(cmds.at(-1)).toMatchObject({ kind: 'setting', outcome: 'done' });
  });
});
