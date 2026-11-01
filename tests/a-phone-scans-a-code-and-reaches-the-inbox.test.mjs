// THE PHONE DOOR (main/phone-link.mjs, 2026-10-09). The desktop
// app's own inbox, reached from a phone that scanned the QR code in Settings.
// It is off until turned on, answers nothing without the key, lists the phones
// that use it, and a reset key locks every one of them out at once.

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createPhoneLink, phoneAddresses, deviceName } from '../main/phone-link.mjs';
import { aFreePort } from './helpers/free-port.mjs';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const open = [];
afterEach(() => { while (open.length) open.pop().close(); });

function make({ tailscale = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-'));
  const dist = path.join(dir, 'dist');
  fs.mkdirSync(dist);
  fs.writeFileSync(path.join(dist, 'index.html'), '<p>inbox</p>');
  const listeners = new Set();
  const channels = new Map([['zero:snapshot', () => ({ items: ['one'] })]]);
  const link = createPhoneLink({
    file: path.join(dir, 'phone-link.json'), channels, listeners, dist, port: 0,
    interfaces: () => ({ en0: [{ family: 'IPv4', internal: false, address: '192.168.1.20' }], utun4: [{ family: 'IPv4', internal: false, address: '100.70.1.2' }] }),
    log: {}, tailscale, warm: () => {},
  });
  open.push(link);
  return { link, dir, listeners };
}

function request(port, pathname, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: pathname, method, headers }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// Resolves with the door's state, because the port it ended up on is in there
// and is the only way to knock: every door here is opened with `port: 0`.
const listening = (link) => new Promise((resolve) => {
  const wait = async () => {
    const s = await link.status();
    return s.listening ? resolve(s) : setTimeout(wait, 10);
  };
  wait();
});

describe('the phone door', () => {
  it('is off until it is turned on, and keeps no key on disk until then', async () => {
    const { link, dir } = make();
    const s = await link.status();
    expect(s.on).toBe(false);
    expect(s.qr).toBe(null);
    expect(fs.existsSync(path.join(dir, 'phone-link.json'))).toBe(false);
    // A shut door is on no port at all, so this one is borrowed to knock on.
    await expect(request(await aFreePort(), '/')).rejects.toThrow();
  });

  it('turned on, it draws a QR code for the Wi-Fi address and answers only with the key', async () => {
    const { link, dir } = make();
    await link.act({ action: 'on' });
    const { port, url, qr } = await listening(link);
    expect(url).toBe(`http://192.168.1.20:${port}/?token=${link.key}`);
    expect(qr).toMatch(/^<svg/);
    expect(fs.statSync(path.join(dir, 'phone-link.json')).mode & 0o777).toBe(0o600);

    expect((await request(port, '/api/zero:snapshot', { method: 'POST' })).status).toBe(403);
    const ok = await request(port, '/api/zero:snapshot', { method: 'POST', headers: { 'x-agentbox-token': link.key, 'x-agentbox-device': 'abc', 'user-agent': IPHONE } });
    expect(ok.status).toBe(200);
    expect(JSON.parse(ok.body)).toEqual({ items: ['one'] });
    // The page itself is public files, as on the loopback door, marked with the door it came through (serve.mjs markTheDoor).
    expect((await request(port, '/')).body).toBe('<meta name="agentbox-door" content="this-computer"><p>inbox</p>');
  });

  it('lists the phone that used it, by what kind of phone it is', async () => {
    const { link } = make();
    await link.act({ action: 'on' });
    const { port } = await listening(link);
    await request(port, '/api/zero:snapshot', { method: 'POST', headers: { 'x-agentbox-token': link.key, 'x-agentbox-device': 'phone-1', 'user-agent': IPHONE } });
    const { devices } = await link.status();
    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({ id: 'phone-1', name: 'iPhone · Safari', live: true, ip: '127.0.0.1' });
  });

  it('serves a home-screen manifest that opens straight into the inbox', async () => {
    const { link } = make();
    await link.act({ action: 'on' });
    const { port } = await listening(link);
    expect((await request(port, '/manifest.webmanifest')).status).toBe(403);
    const m = JSON.parse((await request(port, `/manifest.webmanifest?token=${link.key}`)).body);
    expect(m.start_url).toBe(`/?token=${link.key}`);
    expect(m.display).toBe('standalone');
  });

  it('reset makes a new key, refuses the old one, and closes every open phone', async () => {
    const { link } = make();
    await link.act({ action: 'on' });
    const { port } = await listening(link);
    const old = link.key;
    const closed = new Promise((resolve) => {
      http.get({ host: '127.0.0.1', port, path: `/events?token=${old}&device=phone-2` }, (res) => {
        res.on('data', () => {});
        res.on('close', resolve);
        res.on('error', resolve);
      }).on('error', resolve);
    });
    await new Promise((r) => setTimeout(r, 50));
    expect((await link.status()).devices[0]).toMatchObject({ id: 'phone-2', live: true });

    const after = await link.act({ action: 'reset' });
    await closed;
    expect(link.key).not.toBe(old);
    expect(after.devices).toEqual([]);
    expect((await request(port, '/api/zero:snapshot', { method: 'POST', headers: { 'x-agentbox-token': old } })).status).toBe(403);
    expect((await request(port, '/api/zero:snapshot', { method: 'POST', headers: { 'x-agentbox-token': link.key } })).status).toBe(200);
  });

  it('keeps the same key across a restart, so a home-screen icon keeps working', async () => {
    const { link, dir } = make();
    await link.act({ action: 'on' });
    const key = link.key;
    link.close();
    const again = createPhoneLink({ file: path.join(dir, 'phone-link.json'), channels: new Map(), listeners: new Set(), port: 0, log: {}, tailscale: null });
    open.push(again);
    expect(again.key).toBe(key);
    expect((await again.status()).on).toBe(true);
  });

  it('turned off, it stops answering', async () => {
    const { link } = make();
    await link.act({ action: 'on' });
    const { port } = await listening(link);
    await link.act({ action: 'off' });
    await new Promise((r) => setTimeout(r, 50));
    await expect(request(port, '/')).rejects.toThrow();
  });
});

describe('what the phone page reads', () => {
  it('finds Wi-Fi first and Tailscale second, and skips loopback and public addresses', () => {
    const found = phoneAddresses({
      lo0: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }],
      utun4: [{ family: 'IPv4', internal: false, address: '100.101.102.103' }],
      bridge100: [{ family: 'IPv4', internal: false, address: '192.168.64.1' }],
      en0: [{ family: 'IPv4', internal: false, address: '192.168.1.50' }, { family: 'IPv6', internal: false, address: 'fe80::1' }],
      en5: [{ family: 'IPv4', internal: false, address: '8.8.8.8' }],
    });
    expect(found.map((a) => `${a.via} ${a.host}`)).toEqual(['wifi 192.168.1.50', 'wifi 192.168.64.1', 'tailscale 100.101.102.103']);
  });

  it('names a device from its browser', () => {
    expect(deviceName(IPHONE)).toBe('iPhone · Safari');
    expect(deviceName('Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36')).toBe('Android phone · Chrome');
    // An iPhone home-screen app sends no "Safari/" in its user agent.
    expect(deviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148')).toBe('iPhone · home-screen app');
  });
});

describe('the home-screen icon', () => {
  it('is served by the phone door itself', async () => {
    const { link } = make();
    await link.act({ action: 'on' });
    const { port } = await listening(link);
    const r = await request(port, '/phone-icon.png');
    expect(r.status).toBe(200);
  });
});

// "NOT SECURE" IN THE ADDRESS BAR (measured on an iPhone over Tailscale,
// 2026-10-09). Picking Tailscale now puts `tailscale serve` and its real
// certificate in front of the door, and the QR code carries that address.
describe('the secure address over Tailscale', () => {
  const fakeTailscale = ({ name = 'box.tail1.ts.net', fail = null } = {}) => {
    const calls = [];
    return {
      calls,
      async name() { calls.push('name'); return name; },
      async serve(port) { calls.push(`serve ${port}`); if (fail) throw new Error(fail); },
      async unserve() { calls.push('unserve'); },
    };
  };

  it('picking Tailscale serves https and the code carries the https address', async () => {
    const ts = fakeTailscale();
    const { link } = make({ tailscale: ts });
    await link.act({ action: 'on' });
    // The port it is on before the switch is the one Tailscale is pointed at.
    const { port } = await listening(link);
    const s = await link.act({ action: 'via', via: 'tailscale' });
    expect(ts.calls).toEqual(['name', `serve ${port}`]);
    expect(s.secure).toBe(true);
    expect(s.url).toBe(`https://box.tail1.ts.net:8443/?token=${link.key}`);
    expect(s.error).toBe(null);
  });

  it('Wi-Fi stays plain http and stops the https address', async () => {
    const ts = fakeTailscale();
    const { link } = make({ tailscale: ts });
    await link.act({ action: 'on' });
    await link.act({ action: 'via', via: 'tailscale' });
    await link.act({ action: 'via', via: 'wifi' });
    const s = await listening(link);
    expect(ts.calls.at(-1)).toBe('unserve');
    expect(s.secure).toBe(false);
    expect(s.url).toBe(`http://192.168.1.20:${s.port}/?token=${link.key}`);
  });

  it('turning phones off stops the https address too', async () => {
    const ts = fakeTailscale();
    const { link } = make({ tailscale: ts });
    await link.act({ action: 'on' });
    await link.act({ action: 'via', via: 'tailscale' });
    await link.act({ action: 'off' });
    expect(ts.calls.at(-1)).toBe('unserve');
  });

  it('says why when there is no certificate, and falls back to the plain address', async () => {
    const ts = fakeTailscale({ name: null });
    const { link } = make({ tailscale: ts });
    await link.act({ action: 'on' });
    await link.act({ action: 'via', via: 'tailscale' });
    const s = await listening(link);
    expect(s.secure).toBe(false);
    expect(s.url).toBe(`http://100.70.1.2:${s.port}/?token=${link.key}`);
    expect(s.error).toMatch(/HTTPS certificates turned off/);
  });

  it('names the phone by the address Tailscale forwarded, not loopback', async () => {
    const { link } = make();
    await link.act({ action: 'on' });
    const { port } = await listening(link);
    await request(port, '/api/zero:snapshot', { method: 'POST', headers: { 'x-agentbox-token': link.key, 'x-agentbox-device': 'p', 'x-forwarded-for': '100.80.9.9' } });
    expect((await link.status()).devices[0].ip).toBe('100.80.9.9');
  });
});

// ALERTS AND THE ICON COUNT (2026-10-09). The phone signs up for Web Push on
// the phone door; the computer sends one alert per burst of arrivals, by the
// desktop's own rules, carrying the inbox count for the icon.
describe('alerts on the phone', () => {
  const SUB = { endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: 'BPk', auth: 'au' } };
  const makeWith = (extra = {}) => {
    const sent = [];
    const send = extra.send ?? (async (sub, body) => { sent.push({ sub, body: JSON.parse(body) }); });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-alerts-'));
    const link = createPhoneLink({
      file: path.join(dir, 'phone-link.json'), channels: new Map(), listeners: new Set(), port: 0,
      interfaces: () => ({ en0: [{ family: 'IPv4', internal: false, address: '192.168.1.20' }] }),
      log: {}, tailscale: null, warm: () => {}, send, coalesceMs: 10, atDesk: extra.atDesk ?? (() => false),
    });
    open.push(link);
    return { link, sent, dir };
  };
  const alerts = (port, link, device, body) => request(port, '/phone/alerts', {
    method: 'POST', headers: { 'x-agentbox-token': link.key, 'x-agentbox-device': device, 'content-type': 'application/json', 'user-agent': IPHONE }, body: JSON.stringify(body),
  });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  it('hands a phone the key to sign up with, and keeps its subscription', async () => {
    const { link, dir } = makeWith();
    await link.act({ action: 'on' });
    const { port } = await listening(link);
    expect((await request(port, '/phone/alerts', { method: 'POST', body: '{"action":"key"}' })).status).toBe(403);
    const key = JSON.parse((await alerts(port, link, 'ph1', { action: 'key' })).body);
    expect(key.publicKey).toMatch(/^[A-Za-z0-9_-]{80,}$/);
    expect(JSON.parse((await alerts(port, link, 'ph1', { action: 'subscribe', subscription: SUB })).body)).toEqual({ on: true });
    const kept = JSON.parse(fs.readFileSync(path.join(dir, 'phone-link.json'), 'utf8'));
    expect(kept.alerts.ph1.sub.endpoint).toBe(SUB.endpoint);
    expect((await link.status()).devices.find((d) => d.id === 'ph1')).toMatchObject({ alerts: true });
  });

  it('refuses something that is not a push subscription', async () => {
    const { link } = makeWith();
    await link.act({ action: 'on' });
    const { port } = await listening(link);
    const r = await alerts(port, link, 'ph1', { action: 'subscribe', subscription: { endpoint: 'http://evil.example/x', keys: {} } });
    expect(r.status).toBe(400);
  });

  it('one alert per burst, with the inbox count, and the thread to open', async () => {
    const { link, sent } = makeWith();
    await link.act({ action: 'on' });
    const { port } = await listening(link);
    await alerts(port, link, 'ph1', { action: 'subscribe', subscription: SUB });
    link.count(3);
    link.arrivals([{ id: 'w-1', title: 'The build is green', kind: 'item' }]);
    link.arrivals([{ id: 'w-2', title: 'Pick a name', kind: 'item' }]);
    await wait(60);
    expect(sent).toHaveLength(1);
    // Headed by the thread (tests/a-phone-alert-is-headed-by-the-thread-it-is-about).
    expect(sent[0].body).toMatchObject({ title: 'Pick a name', body: 'Agents are ready', open: 'w-2', count: 3 });
    // Told once; more items stay quiet until the inbox is seen again...
    link.arrivals([{ id: 'w-3', title: 'Third', kind: 'item' }]);
    await wait(60);
    expect(sent).toHaveLength(1);
    // ...but a card asking for a yes always gets through.
    link.arrivals([{ id: 'a-1', title: 'rm -rf build', kind: 'approval' }]);
    await wait(60);
    expect(sent).toHaveLength(2);
    expect(sent[1].body.title).toBe('Agents are waiting on you');
    // Seen at the desktop: the next one speaks again.
    link.seen();
    link.arrivals([{ id: 'w-4', title: 'Fourth', kind: 'item' }]);
    await wait(60);
    expect(sent).toHaveLength(3);
  });

  it('stays quiet while you are at the desktop app', async () => {
    const { link, sent } = makeWith({ atDesk: () => true });
    await link.act({ action: 'on' });
    const { port } = await listening(link);
    await alerts(port, link, 'ph1', { action: 'subscribe', subscription: SUB });
    link.arrivals([{ id: 'w-1', title: 'x', kind: 'item' }]);
    await wait(60);
    expect(sent).toHaveLength(0);
  });

  it('skips a phone that has the inbox open on its screen', async () => {
    const { link, sent } = makeWith();
    await link.act({ action: 'on' });
    const { port } = await listening(link);
    await alerts(port, link, 'looking', { action: 'subscribe', subscription: SUB });
    const req = http.get({ host: '127.0.0.1', port, path: `/events?token=${link.key}&device=looking` }, (res) => res.on('data', () => {}));
    await wait(80);
    link.arrivals([{ id: 'w-1', title: 'x', kind: 'item' }]);
    await wait(60);
    req.destroy();
    expect(sent).toHaveLength(0);
  });

  it('forgets a phone whose subscription is gone', async () => {
    const send = async () => { const e = new Error('Gone'); e.statusCode = 410; throw e; };
    const { link } = makeWith({ send });
    await link.act({ action: 'on' });
    const { port } = await listening(link);
    await alerts(port, link, 'ph1', { action: 'subscribe', subscription: SUB });
    link.arrivals([{ id: 'w-1', title: 'x', kind: 'item' }]);
    await wait(60);
    expect((await link.status()).devices.find((d) => d.id === 'ph1')?.alerts ?? false).toBe(false);
  });

  it('a new key stops alerts to every phone, and the desktop can stop one', async () => {
    const { link, sent } = makeWith();
    await link.act({ action: 'on' });
    const { port } = await listening(link);
    await alerts(port, link, 'ph1', { action: 'subscribe', subscription: SUB });
    await link.act({ action: 'stop-alerts', device: 'ph1' });
    expect((await link.status()).devices.filter((d) => d.alerts)).toEqual([]);
    await alerts(port, link, 'ph1', { action: 'subscribe', subscription: SUB });
    await link.act({ action: 'reset' });
    link.arrivals([{ id: 'w-1', title: 'x', kind: 'item' }]);
    await wait(60);
    expect(sent).toHaveLength(0);
  });

  it('sends a test alert to the phone that asked', async () => {
    const { link, sent } = makeWith();
    await link.act({ action: 'on' });
    const { port } = await listening(link);
    await alerts(port, link, 'ph1', { action: 'subscribe', subscription: SUB });
    const r = JSON.parse((await alerts(port, link, 'ph1', { action: 'test' })).body);
    expect(r.sent).toBe(true);
    expect(sent[0].body.title).toBe('Alerts are on');
  });

  it('serves the alert worker with the app name filled in', async () => {
    const { link } = makeWith();
    await link.act({ action: 'on' });
    const { port } = await listening(link);
    const r = await request(port, '/phone-sw.js');
    expect(r.status).toBe(200);
    expect(r.body).toMatch(/showNotification/);
    expect(r.body).not.toMatch(/__APP_NAME__/);
  });
});

// AND WHAT LEAVES FOR APPLE IS A REAL WEB PUSH: encrypted for the phone's own
// key, readable with it and nothing else.
describe('the alert on the wire', () => {
  it('encrypts the payload so only the phone can read it', async () => {
    const crypto = await import('node:crypto');
    const webpush = (await import('web-push')).default;
    const ece = (await import('http_ece')).default;
    const phone = crypto.createECDH('prime256v1');
    phone.generateKeys();
    const auth = crypto.randomBytes(16);
    const sub = { endpoint: 'https://web.push.apple.com/x', keys: { p256dh: phone.getPublicKey('base64url'), auth: auth.toString('base64url') } };
    const vapid = webpush.generateVAPIDKeys();
    const said = JSON.stringify({ title: 'An agent is ready', body: 'Pick a name', count: 2 });
    const req = webpush.generateRequestDetails(sub, said, { vapidDetails: { subject: 'https://github.com/savannahfeder/agentbox', ...vapid } });
    expect(req.headers.Authorization).toMatch(/^vapid t=/);
    const plain = ece.decrypt(req.body, { version: 'aes128gcm', privateKey: phone, authSecret: auth.toString('base64url') });
    expect(JSON.parse(plain.toString())).toEqual(JSON.parse(said));
  });
});

// NO ALERT EVER ARRIVED (an iPhone, 2026-10-09). Node gave each of Apple's
// eight addresses 250ms, the slow link needed more, every send timed out, and
// the failure went to a log nobody reads.
describe('an alert that cannot be sent', () => {
  const SUB = { endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: 'BPk', auth: 'au' } };
  const req = (port, link, body) => request(port, '/phone/alerts', {
    method: 'POST', headers: { 'x-agentbox-token': link.key, 'x-agentbox-device': 'ph1', 'content-type': 'application/json', 'user-agent': IPHONE }, body: JSON.stringify(body),
  });
  const build = (send) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-fail-'));
    const link = createPhoneLink({ file: path.join(dir, 'p.json'), channels: new Map(), listeners: new Set(), port: 0, interfaces: () => ({}), log: {}, tailscale: null, warm: () => {}, send, coalesceMs: 10 });
    open.push(link);
    return link;
  };

  it('gives each of Apple\'s addresses long enough to connect', async () => {
    let opts = null;
    const link = build(async (_s, _b, o) => { opts = o; });
    await link.act({ action: 'on' });
    const { port } = await listening(link);
    await req(port, link, { action: 'subscribe', subscription: SUB });
    await req(port, link, { action: 'test' });
    expect(opts.agent.options.autoSelectFamilyAttemptTimeout).toBeGreaterThanOrEqual(2000);
  });

  it('says on the Phone page that the last alert failed, and why', async () => {
    const link = build(async () => { const e = new Error('connect ETIMEDOUT'); e.code = 'ETIMEDOUT'; throw e; });
    await link.act({ action: 'on' });
    const { port } = await listening(link);
    await req(port, link, { action: 'subscribe', subscription: SUB });
    const r = await req(port, link, { action: 'test' });
    expect(r.status).toBe(400);
    expect(JSON.parse(r.body).error).toMatch(/could not send it \(ETIMEDOUT connect ETIMEDOUT\)/);
    expect((await link.status()).devices.find((d) => d.id === 'ph1')).toMatchObject({ alerts: true, alertError: 'ETIMEDOUT connect ETIMEDOUT' });
  });
});
