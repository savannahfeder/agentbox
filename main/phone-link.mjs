// THE PHONE DOOR: the desktop app's own inbox, answering a phone.
//
// main/serve.mjs is a door for a browser tab on this computer: it boots a
// second copy of the doing half and listens on the loopback address only. A
// phone needs the opposite on both counts. It must reach the inbox the desktop
// window is showing, not a second copy of it, and it must reach it from off
// this computer.
//
// So this takes the handlers the desktop app already registered (main.mjs
// collects them as `registerIpc` files them) and the pushes the desktop window
// already receives, and puts serve.mjs's request handler behind a server that
// listens on every address, once it is turned on in Settings.
//
// THE KEY. Whoever holds it can run agents on this computer, so it is long,
// random, kept in a file only this user can read, and shown only as the QR
// code. It survives a restart, because a phone's home-screen icon carries it
// and a key that changed on every launch would break that icon every launch.
// Reset makes a new one and closes every open phone at once.
//
// THE DEVICES. Each phone's page makes up an id for itself and sends it along
// with the key. The id is the phone's own word and proves nothing; the list is
// there so you can see who is connected, and Reset is what actually locks
// somebody out.

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import webpush from 'web-push';
import { banner, shouldSpeak } from '../shared/notify-rules.mjs';
import { createHandler } from './serve.mjs';
import { Name } from '../shared/product-name.mjs';

export const PHONE_PORT = 41745;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ICON = path.join(HERE, 'phone-icon.png');
const WORKER = path.join(HERE, 'phone-sw.js');

// ALERTS ON THE PHONE. A phone app on the home screen can get
// Web Push on iOS 16.4 and later, over https only, so over the Tailscale
// address. The computer signs each alert with its own key pair (VAPID) and
// hands it, encrypted for that one phone, to the phone's push service (Apple's,
// for an iPhone). The subject names who is sending; Apple wants a URL or a
// mailto, and the project's page is the honest one.
const PUSH_SUBJECT = 'https://github.com/savannahfeder/agentbox';
const COALESCE_MS = 1500;
// THE CONNECTION TO APPLE. Node tries each of a host's addresses for 250ms
// before the next, and web.push.apple.com has eight, so over a slow link
// (measured on this Mac, 2026-10-09: three connects in four failed with
// ETIMEDOUT after 2s) every alert was dropped. Two and a half seconds an
// address connected four in four, in about half a second each.
const PUSH_AGENT = new https.Agent({ keepAlive: true, autoSelectFamilyAttemptTimeout: 2500 });
const DEVICE_HEADER = 'x-agentbox-device';
// A phone that has asked nothing for this long, and has no live event stream,
// is listed as last seen rather than connected.
const QUIET_MS = 30_000;

const newKey = () => crypto.randomBytes(24).toString('base64url');

// THE SECURE ADDRESS. Over plain http a phone's browser says "Not Secure" in
// the address bar (measured on an iPhone, 2026-10-09). Tailscale can put a real
// certificate in front of this server: `tailscale serve` answers
// https://<this computer>.<tailnet>.ts.net:8443 inside the tailnet only, and
// passes each request on to the loopback port. So picking Tailscale picks that.
// Wi-Fi has no such certificate and stays plain http.
export const SECURE_PORT = 8443;
const TAILSCALE_BINS = ['/Applications/Tailscale.app/Contents/MacOS/tailscale', '/usr/local/bin/tailscale', '/opt/homebrew/bin/tailscale', '/usr/bin/tailscale'];

/** The `tailscale` command, as three questions. Null when it is not installed. */
export function tailscaleCli(bins = TAILSCALE_BINS) {
  const bin = bins.find((b) => { try { fs.accessSync(b, fs.constants.X_OK); return true; } catch { return false; } });
  if (!bin) return null;
  const run = (args) => new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: 20_000 }, (err, stdout, stderr) => (err ? reject(new Error(String(stderr || err.message).trim())) : resolve(String(stdout))));
  });
  return {
    /** This computer's name in the tailnet, if it can have a certificate. */
    async name() {
      const d = JSON.parse(await run(['status', '--json']));
      const host = String(d.Self?.DNSName ?? '').replace(/\.$/, '');
      return host && (d.CertDomains ?? []).includes(host) ? host : null;
    },
    serve: (port) => run(['serve', '--bg', '--yes', `--https=${SECURE_PORT}`, `http://127.0.0.1:${port}`]),
    unserve: () => run(['serve', `--https=${SECURE_PORT}`, 'off']),
  };
}

/** Wi-Fi and Tailscale addresses on this computer, in that order. */
export function phoneAddresses(interfaces = os.networkInterfaces()) {
  const out = [];
  for (const [name, list] of Object.entries(interfaces)) {
    for (const a of list ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      const [x, y] = a.address.split('.').map(Number);
      // Tailscale hands out addresses from 100.64.0.0/10.
      if (x === 100 && y >= 64 && y <= 127) out.push({ via: 'tailscale', host: a.address, iface: name });
      else if (x === 10 || (x === 172 && y >= 16 && y <= 31) || (x === 192 && y === 168)) {
        out.push({ via: 'wifi', host: a.address, iface: name });
      }
    }
  }
  // en0 is the built-in Wi-Fi or Ethernet; prefer it over a VM bridge.
  const rank = (a) => (a.via === 'wifi' ? (a.iface === 'en0' ? 0 : 1) : 2);
  return out.sort((a, b) => rank(a) - rank(b));
}

/** "iPhone · Safari" from a user agent string. */
export function deviceName(ua = '') {
  const what = /iPhone/.test(ua) ? 'iPhone'
    : /iPad/.test(ua) ? 'iPad'
    : /Android/.test(ua) ? 'Android phone'
    : /Macintosh/.test(ua) ? 'Mac'
    : /Windows/.test(ua) ? 'Windows PC'
    : /Linux/.test(ua) ? 'Linux computer'
    : 'Device';
  const browser = /EdgA?\//.test(ua) ? 'Edge'
    : /CriOS|Chrome\//.test(ua) ? 'Chrome'
    : /FxiOS|Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari'
    : /AppleWebKit/.test(ua) ? 'home-screen app'
    : null;
  return browser ? `${what} · ${browser}` : what;
}

/**
 * @param {{ file: string, channels: Map<string, Function>, listeners: Set<Function>,
 *           dist?: string, port?: number, onChange?: () => void,
 *           interfaces?: () => object, log?: { warn?: Function } }} options
 */
export function createPhoneLink({ file, channels, listeners, dist, port = PHONE_PORT, onChange = () => {}, interfaces = () => os.networkInterfaces(), log = console, tailscale = tailscaleCli(), warm = (url) => fetch(url).catch(() => {}), send = (sub, body, opts) => webpush.sendNotification(sub, body, opts), atDesk = () => false, coalesceMs = COALESCE_MS }) {
  let saved = read(file);
  let server = null;
  let error = null;
  /** The https name `tailscale serve` is answering on, or why it is not. */
  let secure = { host: null, error: null, busy: null };
  /** id -> { id, name, ip, firstSeen, lastSeen, streams: Set<ServerResponse> } */
  const devices = new Map();

  const key = () => saved.key;
  // What the alerts know: the inbox count the desktop last drew, the arrivals
  // not yet told, and whether a burst has been told already (the desktop's
  // own rule, shared/notify-rules.mjs: once, then again only for a card).
  let count = 0;
  const unseen = new Map();
  let timer = null;
  let spoke = false;
  let spokeAsk = false;
  const inner = createHandler({ channels, token: key, listeners, dist });

  function save() {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(saved, null, 2), { mode: 0o600 });
    try { fs.chmodSync(file, 0o600); } catch { /* best effort */ }
  }

  function seen(req, url) {
    const id = String(req.headers[DEVICE_HEADER] || url.searchParams.get('device') || '').slice(0, 64);
    if (!id) return null;
    const now = Date.now();
    let d = devices.get(id);
    if (!d) {
      d = { id, name: deviceName(req.headers['user-agent']), ip: null, firstSeen: now, lastSeen: now, streams: new Set() };
      devices.set(id, d);
      onChange();
    }
    d.lastSeen = now;
    // Behind `tailscale serve` every request arrives from loopback; the phone's
    // own address is in the header it adds.
    const from = String(req.socket.remoteAddress ?? '').replace(/^::ffff:/, '');
    const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
    d.ip = (from === '127.0.0.1' || from === '::1') && forwarded ? forwarded : from;
    return d;
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://phone');
    const guarded = url.pathname === '/events' || url.pathname.startsWith('/api/') || url.pathname === '/manifest.webmanifest';
    const given = req.headers['x-agentbox-token'] || url.searchParams.get('token');
    const ok = given === saved.key;

    // THE HOME-SCREEN ICON. Its start address carries the key, so the icon
    // opens straight into the inbox. Asked for with the key, like the api.
    if (url.pathname === '/manifest.webmanifest') {
      if (!ok) { res.writeHead(403).end(); return; }
      res.writeHead(200, { 'content-type': 'application/manifest+json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({
        name: Name,
        short_name: Name,
        start_url: `/?token=${encodeURIComponent(given)}`,
        scope: '/',
        display: 'standalone',
        background_color: '#16161a',
        theme_color: '#16161a',
        icons: [{ src: '/phone-icon.png', sizes: '512x512', type: 'image/png', purpose: 'any' }],
      }));
      return;
    }

    // The alert worker is the page's own script, so it is as public as the page.
    if (url.pathname === '/phone-sw.js') {
      fs.readFile(WORKER, (err, buf) => {
        if (err) { res.writeHead(404).end(); return; }
        res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache', 'service-worker-allowed': '/' });
        res.end(String(buf).replaceAll('__APP_NAME__', Name));
      });
      return;
    }

    // A phone turning its alerts on or off, asking for the key to sign up
    // with, or asking for a test. With the key, like the api.
    if (url.pathname === '/phone/alerts') {
      if (!ok || req.method !== 'POST') { res.writeHead(403).end(); return; }
      const d = seen(req, url);
      let body = {};
      try { body = JSON.parse((await readJson(req)) || '{}'); } catch { res.writeHead(400).end(); return; }
      try {
        const answer = await alertsFor(d, body);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(answer));
      } catch (err) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: String(err.message ?? err) }));
      }
      return;
    }

    // The icon lives beside this file, not in the built screen.
    if (url.pathname === '/phone-icon.png') {
      fs.readFile(ICON, (err, buf) => {
        if (err) { res.writeHead(404).end(); return; }
        res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'max-age=86400' });
        res.end(buf);
      });
      return;
    }

    if (guarded && ok) {
      const d = seen(req, url);
      if (d && url.pathname === '/events') {
        // A phone that opens the inbox has seen what was waiting.
        seenAll();
        d.streams.add(res);
        onChange();
        req.on('close', () => { d.streams.delete(res); d.lastSeen = Date.now(); onChange(); });
      }
    }
    return inner(req, res);
  }

  function start() {
    if (server) return;
    error = null;
    server = http.createServer(handle);
    server.on('error', (err) => {
      error = err.code === 'EADDRINUSE'
        ? `Port ${port} is taken by another program, so phones cannot reach this app.`
        : String(err.message ?? err);
      log.warn?.('[phone-link]', error);
      server = null;
      onChange();
    });
    server.listen(port, '0.0.0.0', () => onChange());
  }

  // ON WHEN PHONES ARE LET IN OVER TAILSCALE, OFF OTHERWISE. Only the one
  // https port is touched, so anything else this computer serves is left alone.
  function secureWanted() { return saved.on && saved.via === 'tailscale'; }
  function settleSecure() {
    const run = (secure.busy ?? Promise.resolve()).then(async () => {
      if (secureWanted() && !secure.host) {
        if (!tailscale) { secure = { ...secure, error: 'Tailscale is not installed here, so there is no secure address.' }; return; }
        try {
          const host = await tailscale.name();
          if (!host) throw new Error('This tailnet has HTTPS certificates turned off. Turn them on in the Tailscale admin console, under DNS.');
          await tailscale.serve(port);
          secure = { ...secure, host, error: null };
          // The first request makes Tailscale fetch the certificate, which took
          // 40 seconds when measured. Make it now, not on the phone.
          warm(`https://${host}:${SECURE_PORT}/`);
        } catch (err) {
          secure = { ...secure, host: null, error: `No secure address: ${err.message}` };
          log.warn?.('[phone-link]', secure.error);
        }
      } else if (!secureWanted() && secure.host) {
        try { await tailscale?.unserve(); } catch (err) { log.warn?.('[phone-link] tailscale serve off:', err.message); }
        secure = { ...secure, host: null, error: null };
      } else if (!secureWanted()) {
        secure = { ...secure, error: null };
      }
    }).finally(() => { if (secure.busy === run) secure.busy = null; onChange(); });
    secure.busy = run;
    return run;
  }

  function stop() {
    if (!server) return;
    for (const d of devices.values()) for (const r of d.streams) r.destroy();
    server.close();
    server = null;
    devices.clear();
  }

  function dropEveryPhone() {
    for (const d of devices.values()) for (const r of d.streams) r.destroy();
    devices.clear();
    // A phone locked out by a new key must not keep getting alerts either.
    saved.alerts = {};
  }

  /* ------------------------------- alerts -------------------------------- */

  function vapid() {
    if (!saved.vapid) { saved.vapid = webpush.generateVAPIDKeys(); save(); }
    return saved.vapid;
  }

  async function alertsFor(d, { action, subscription } = {}) {
    if (!d) throw new Error('This phone did not say which phone it is.');
    if (action === 'key') return { publicKey: vapid().publicKey, on: !!saved.alerts[d.id] };
    if (action === 'state') return { on: !!saved.alerts[d.id] };
    if (action === 'subscribe') {
      const endpoint = String(subscription?.endpoint ?? '');
      if (!/^https:\/\//.test(endpoint) || !subscription?.keys?.p256dh || !subscription?.keys?.auth) throw new Error('That is not a push subscription.');
      saved.alerts[d.id] = { sub: { endpoint, keys: { p256dh: String(subscription.keys.p256dh), auth: String(subscription.keys.auth) } }, name: d.name, since: Date.now() };
      save();
      onChange();
      return { on: true };
    }
    if (action === 'unsubscribe') { delete saved.alerts[d.id]; save(); onChange(); return { on: false }; }
    if (action === 'test') {
      if (!saved.alerts[d.id]) throw new Error('Alerts are off on this phone.');
      const sent = await push(d.id, { title: 'Alerts are on', body: `This is how ${Name} tells you an agent needs you.`, count, open: null });
      if (!sent && saved.alerts[d.id]) throw new Error(`The computer could not send it (${saved.alerts[d.id].lastError}).`);
      return { on: true, sent };
    }
    throw new Error(`Unknown alerts action ${action}`);
  }

  /** One alert to one phone. A phone whose subscription is gone is forgotten. */
  async function push(id, payload) {
    const entry = saved.alerts[id];
    if (!entry) return false;
    try {
      await send(entry.sub, JSON.stringify({ ...payload, tag: 'agentbox' }), {
        vapidDetails: { subject: PUSH_SUBJECT, publicKey: vapid().publicKey, privateKey: vapid().privateKey },
        TTL: 6 * 3600,
        urgency: 'high',
        agent: PUSH_AGENT,
      });
      entry.lastSent = Date.now();
      entry.lastError = null;
      return true;
    } catch (err) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        delete saved.alerts[id];
        save();
        onChange();
      } else {
        // Said on the Phone page too, not only in a log nobody reads.
        entry.lastError = `${err?.statusCode ?? err?.code ?? 'error'} ${String(err?.body || err?.message || err).trim()}`.trim();
        entry.lastErrorAt = Date.now();
        log.warn?.('[phone-link] alert not sent:', entry.lastError);
        onChange();
      }
      return false;
    }
  }

  function seenAll() {
    unseen.clear();
    if (timer) { clearTimeout(timer); timer = null; }
    spoke = false;
    spokeAsk = false;
  }

  async function speak() {
    timer = null;
    if (atDesk()) return seenAll();
    const items = [...unseen.values()];
    if (!shouldSpeak({ spoke, spokeAsk, waiting: items })) return;
    const say = banner(items);
    if (!say) return;
    spoke = true;
    if (items.some((i) => i.kind === 'approval')) spokeAsk = true;
    // A phone with the inbox open on its screen is looking already.
    const away = Object.keys(saved.alerts).filter((id) => !(devices.get(id)?.streams.size > 0));
    await Promise.all(away.map((id) => push(id, { title: say.title, body: say.body, open: say.open, count })));
  }

  /** What the desktop's notifier was told arrived (main/notify.mjs). */
  function arrivals(list) {
    if (!saved.on || !Object.keys(saved.alerts).length) return;
    if (!Array.isArray(list) || !list.length) return;
    if (atDesk()) return seenAll();
    for (const a of list) if (a?.id && !unseen.has(a.id)) unseen.set(a.id, a);
    if (!unseen.size || timer) return;
    timer = setTimeout(() => { void speak(); }, coalesceMs);
  }

  async function status({ via } = {}) {
    const addrs = phoneAddresses(interfaces());
    const pick = addrs.find((a) => a.via === (via ?? saved.via)) ?? addrs[0] ?? null;
    const safe = pick?.via === 'tailscale' && secure.host;
    const url = !pick ? null
      : safe ? `https://${secure.host}:${SECURE_PORT}/?token=${encodeURIComponent(saved.key)}`
      : `http://${pick.host}:${port}/?token=${encodeURIComponent(saved.key)}`;
    const now = Date.now();
    return {
      on: !!saved.on,
      listening: !!server?.listening,
      error: error ?? (pick?.via === 'tailscale' ? secure.error : null),
      port,
      secure: !!safe,
      settingUp: !!secure.busy,
      via: pick?.via ?? null,
      routes: [...new Set(addrs.map((a) => a.via))].map((v) => ({ via: v, host: addrs.find((a) => a.via === v).host })),
      url: saved.on ? url : null,
      qr: saved.on && url ? await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }) : null,
      // The phones seen since the app started, and the phones with alerts on,
      // which may not have opened the inbox since.
      devices: [
        ...[...devices.values()].map((d) => ({ id: d.id, name: d.name, ip: d.ip, firstSeen: d.firstSeen, lastSeen: d.lastSeen, live: d.streams.size > 0 || now - d.lastSeen < QUIET_MS, alerts: !!saved.alerts[d.id], alertError: saved.alerts[d.id]?.lastError ?? null })),
        ...Object.entries(saved.alerts).filter(([id]) => !devices.has(id)).map(([id, a]) => ({ id, name: a.name, ip: null, firstSeen: a.since, lastSeen: a.lastSent ?? a.since, live: false, alerts: true, alertError: a.lastError ?? null })),
      ].sort((a, b) => b.lastSeen - a.lastSeen),
    };
  }

  /** The Settings page's one channel. */
  async function act({ action, via, device } = {}) {
    if (action === 'on') { saved.on = true; save(); start(); await settleSecure(); }
    else if (action === 'off') { saved.on = false; save(); stop(); await settleSecure(); }
    else if (action === 'reset') { saved.key = newKey(); save(); dropEveryPhone(); }
    else if (action === 'via' && (via === 'wifi' || via === 'tailscale')) { saved.via = via; save(); await settleSecure(); }
    else if (action === 'stop-alerts' && typeof device === 'string') { delete saved.alerts[device]; save(); }
    else if (action !== 'status') throw new Error(`Unknown phone action ${action}`);
    onChange();
    return status();
  }

  if (saved.on) { start(); void settleSecure(); }
  return {
    act, status, start, stop, handle, arrivals, seen: seenAll,
    /** The inbox count the desktop last drew, which each alert carries for the icon. */
    count(n) { if (Number.isFinite(n)) count = Math.max(0, Math.floor(n)); },
    settled: () => secure.busy ?? Promise.resolve(),
    get key() { return saved.key; },
    close() { if (timer) clearTimeout(timer); stop(); },
  };
}

function read(file) {
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first run */ }
  if (typeof saved.key !== 'string' || saved.key.length < 24) saved.key = newKey();
  return {
    on: !!saved.on,
    key: saved.key,
    via: saved.via === 'tailscale' ? 'tailscale' : 'wifi',
    vapid: saved.vapid?.publicKey && saved.vapid?.privateKey ? saved.vapid : null,
    alerts: saved.alerts && typeof saved.alerts === 'object' ? saved.alerts : {},
  };
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 64 * 1024) reject(new Error('Body too large')); });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}
