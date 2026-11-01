// ONE ALERT, NOT ONE PER HOME-SCREEN ICON (2026-10-13).
//
// Reported: "tons and tons of notifications ... they don't get grouped
// properly together. I end up with three groups that I have to delete."
//
// Measured on the reporter's Mac: phone-link.json held THREE alert
// subscriptions, all on web.push.apple.com, signed up an hour apart on one
// evening, and every alert went to all three. Each time the app is added to
// the home screen again (over Wi-Fi, over Tailscale, through the relay) it is a
// separate web app to iOS, with its own id here and its own notification
// group, so one phone got every alert three times in three groups.
//
// So the phone that turned alerts on last is the one that hears them, and a
// file that already holds several keeps only the newest.

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createPhoneLink } from '../main/phone-link.mjs';

const open = [];
afterEach(() => { while (open.length) open.pop().close(); });

const sub = (n) => ({ endpoint: `https://web.push.apple.com/${n}`, keys: { p256dh: `BP${n}`, auth: `au${n}` } });

function make({ file } = {}) {
  const sent = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'one-phone-'));
  const link = createPhoneLink({
    file: file ?? path.join(dir, 'phone-link.json'), channels: new Map(), listeners: new Set(), port: 0,
    interfaces: () => ({ en0: [{ family: 'IPv4', internal: false, address: '192.168.1.20' }] }),
    log: {}, tailscale: null, warm: () => {}, coalesceMs: 10, atDesk: () => false,
    send: async (s, body) => { sent.push({ endpoint: s.endpoint, body: JSON.parse(body) }); },
  });
  open.push(link);
  return { link, sent, dir };
}

function alerts(port, link, device, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1', port, path: '/phone/alerts', method: 'POST',
      headers: { 'x-agentbox-token': link.key, 'x-agentbox-device': device, 'content-type': 'application/json' },
    }, (res) => { let d = ''; res.on('data', (c) => { d += c; }); res.on('end', () => resolve({ status: res.statusCode, body: d })); });
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
}

// Resolves with the state, because `port: 0` means only the socket knows
// which port the door ended up on.
const listening = (link) => new Promise((resolve) => {
  const wait = async () => {
    const s = await link.status();
    return s.listening ? resolve(s) : setTimeout(wait, 10);
  };
  wait();
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const withAlerts = async (link) => (await link.status()).devices.filter((d) => d.alerts).map((d) => d.id);

describe('alerts go to one phone', () => {
  it('three home-screen icons signed up: one alert, to the newest', async () => {
    const { link, sent } = make();
    await link.act({ action: 'on' });
    const { port } = await listening(link);
    await alerts(port, link, 'wifi-icon', { action: 'subscribe', subscription: sub(1) });
    await alerts(port, link, 'tailscale-icon', { action: 'subscribe', subscription: sub(2) });
    await alerts(port, link, 'relay-icon', { action: 'subscribe', subscription: sub(3) });
    expect(await withAlerts(link)).toEqual(['relay-icon']);
    link.arrivals([{ id: 'w-1', title: 'The build is green', kind: 'item' }]);
    await wait(60);
    expect(sent.map((s) => s.endpoint)).toEqual(['https://web.push.apple.com/3']);
  });

  it('the same icon signing up again keeps its alerts', async () => {
    const { link, sent } = make();
    await link.act({ action: 'on' });
    const { port } = await listening(link);
    await alerts(port, link, 'ph', { action: 'subscribe', subscription: sub(1) });
    await alerts(port, link, 'ph', { action: 'subscribe', subscription: sub(1) });
    expect(await withAlerts(link)).toEqual(['ph']);
    link.arrivals([{ id: 'w-1', title: 'x', kind: 'item' }]);
    await wait(60);
    expect(sent).toHaveLength(1);
  });

  it('an older icon asking whether alerts are on is told they are off, so it can take them back', async () => {
    const { link } = make();
    await link.act({ action: 'on' });
    const { port } = await listening(link);
    await alerts(port, link, 'old', { action: 'subscribe', subscription: sub(1) });
    await alerts(port, link, 'new', { action: 'subscribe', subscription: sub(2) });
    expect(JSON.parse((await alerts(port, link, 'old', { action: 'state' })).body)).toEqual({ on: false });
    expect(JSON.parse((await alerts(port, link, 'new', { action: 'state' })).body)).toEqual({ on: true });
  });

  it('a file that already holds three keeps only the newest when the app starts', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'one-phone-file-'));
    const file = path.join(dir, 'phone-link.json');
    fs.writeFileSync(file, JSON.stringify({
      on: false, key: 'k'.repeat(32),
      alerts: {
        a: { sub: sub(1), name: 'Device', since: 1000 },
        c: { sub: sub(3), name: 'Device', since: 3000 },
        b: { sub: sub(2), name: 'Device', since: 2000 },
      },
    }));
    const { link } = make({ file });
    expect(await withAlerts(link)).toEqual(['c']);
  });

  it('a file with one subscription is left as it is', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'one-phone-file-'));
    const file = path.join(dir, 'phone-link.json');
    fs.writeFileSync(file, JSON.stringify({ on: false, key: 'k'.repeat(32), alerts: { only: { sub: sub(1), name: 'Device', since: 5 } } }));
    const { link } = make({ file });
    expect(await withAlerts(link)).toEqual(['only']);
  });
});
