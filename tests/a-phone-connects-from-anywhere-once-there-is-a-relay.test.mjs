// "ANYWHERE" ON THE PHONE PAGE (2026-10-12). The relay is the setup-free way
// for a phone to reach this Mac from any network ("it should be as simple as a
// QR code", "yes go ahead with cloudflare"). This is the Mac's side of the
// choice, in main/phone-link.mjs:
// - with a relay to use it is the choice a new person starts on, and the
//   others stay;
// - the phone server then answers this Mac only, as it does behind Tailscale,
//   because the relay client reaches it on 127.0.0.1 and nothing else should;
// - the code holds the relay's address with the key in the part after #, which
//   a browser never sends, so the relay never sees the key;
// - the home-screen icon saved through the relay opens the same way;
// - with no relay configured nothing changes: Wi-Fi first, no "Anywhere".
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createPhoneLink } from '../main/phone-link.mjs';

const open = [];
afterEach(() => { while (open.length) open.pop().close(); });

function make({ relayUrl = 'https://relay.example.workers.dev', saved = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-anywhere-'));
  const dist = path.join(dir, 'dist');
  fs.mkdirSync(dist);
  fs.writeFileSync(path.join(dist, 'index.html'), '<p>inbox</p>');
  if (saved) fs.writeFileSync(path.join(dir, 'phone-link.json'), JSON.stringify(saved));
  const relays = [];
  const createRelay = (opts) => {
    const r = { opts, started: 0, stopped: 0, restarted: 0, on: false,
      start() { this.started += 1; this.on = true; }, stop() { this.stopped += 1; this.on = false; }, restart() { this.restarted += 1; },
      state: () => ({ connected: r.on, error: null }) };
    relays.push(r);
    return r;
  };
  const link = createPhoneLink({
    file: path.join(dir, 'phone-link.json'), channels: new Map(), listeners: new Set(), dist, port: 0,
    interfaces: () => ({ en0: [{ family: 'IPv4', internal: false, address: '192.168.1.20' }] }),
    log: {}, tailscale: null, warm: () => {}, relayUrl, createRelay,
  });
  open.push(link);
  return { link, relays, dir };
}

// Resolves with the state, which is where the port it ended up on is: these
// doors are opened with `port: 0` so two test runs cannot collide.
const listening = (link) => new Promise((resolve) => {
  const wait = async () => {
    const s = await link.status();
    return s.listening ? resolve(s) : setTimeout(wait, 10);
  };
  wait();
});

function request(port, pathname, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: pathname, headers }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

describe('with a relay to use', () => {
  it('a new person starts on Anywhere, and Wi-Fi is still there to pick', async () => {
    const { link } = make();
    const s = await link.act({ action: 'on' });
    expect(s.via).toBe('anywhere');
    expect(s.routes.map((r) => r.via)).toEqual(expect.arrayContaining(['anywhere', 'wifi']));
  });

  it('the code is the relay\'s address with the key after #, never before it', async () => {
    const { link } = make();
    const s = await link.act({ action: 'on' });
    expect(s.url).toBe(`https://relay.example.workers.dev/#k=${link.key}`);
    expect(s.url.split('#')[0]).not.toContain(link.key);
    expect(s.secure).toBe(true);
    expect(s.qr).toContain('<svg');
  });

  it('the Mac connects out to the relay, and the phone server answers this Mac only', async () => {
    const { link, relays } = make();
    await link.act({ action: 'on' });
    const { port } = await listening(link);
    expect(relays[0].on).toBe(true);
    expect(relays[0].opts.relayUrl).toBe('https://relay.example.workers.dev');
    expect(relays[0].opts.key()).toBe(link.key);
    expect(relays[0].opts.port()).toBe(port);
    expect((await link.status()).host).toBe('127.0.0.1');
  });

  it('picking Wi-Fi lets go of the relay and opens to the network again', async () => {
    const { link, relays } = make();
    await link.act({ action: 'on' });
    await listening(link);
    await link.act({ action: 'via', via: 'wifi' });
    // Opening to the network is a fresh bind, so the address it draws carries
    // the port it has now.
    const s = await listening(link);
    expect(relays[0].on).toBe(false);
    expect(s.host).toBe('0.0.0.0');
    expect(s.url).toBe(`http://192.168.1.20:${s.port}/?token=${link.key}`);
  });

  it('a reset key joins a new room', async () => {
    const { link, relays } = make();
    await link.act({ action: 'on' });
    await link.act({ action: 'reset' });
    expect(relays[0].restarted).toBe(1);
    expect(relays[0].opts.key()).toBe(link.key);
  });

  it('turning phones off lets go of the relay', async () => {
    const { link, relays } = make();
    await link.act({ action: 'on' });
    await link.act({ action: 'off' });
    expect(relays[0].on).toBe(false);
  });

  it('someone who picked Wi-Fi keeps Wi-Fi, and so does someone on Tailscale', async () => {
    const { link } = make({ saved: { on: false, key: 'k'.repeat(32), via: 'wifi', viaChosen: true } });
    expect((await link.act({ action: 'on' })).via).toBe('wifi');
    const { link: ts } = make({ saved: { on: false, key: 'k'.repeat(32), via: 'tailscale' } });
    expect((await ts.status()).via).not.toBe('anywhere');
  });

  it('a file that says Wi-Fi only because Wi-Fi was all there was moves to Anywhere', async () => {
    // Before the relay every file was saved with via "wifi", picked or not.
    const { link } = make({ saved: { on: false, key: 'k'.repeat(32), via: 'wifi' } });
    expect((await link.act({ action: 'on' })).via).toBe('anywhere');
  });

  it('a pick is remembered as a pick', async () => {
    const { link, dir } = make();
    await link.act({ action: 'on' });
    await link.act({ action: 'via', via: 'wifi' });
    link.close();
    const again = make({ saved: JSON.parse(fs.readFileSync(path.join(dir, 'phone-link.json'), 'utf8')) });
    expect((await again.link.act({ action: 'on' })).via).toBe('wifi');
  });

  it('the home-screen icon saved through the relay opens with the key after #', async () => {
    const { link } = make();
    await link.act({ action: 'on' });
    const { port } = await listening(link);
    const relayed = JSON.parse((await request(port, `/manifest.webmanifest?token=${link.key}`, { 'x-agentbox-relay': '1' })).body);
    expect(relayed.start_url).toBe(`/#k=${link.key}`);
  });
});

describe('with no relay configured', () => {
  it('nothing changes: Wi-Fi first, and no Anywhere to pick', async () => {
    const { link, relays } = make({ relayUrl: '' });
    const s = await link.act({ action: 'on' });
    expect(s.via).toBe('wifi');
    expect(s.routes.map((r) => r.via)).not.toContain('anywhere');
    expect(relays.length === 0 || !relays[0].on).toBe(true);
    expect(await link.act({ action: 'via', via: 'anywhere' }).then((x) => x.via)).toBe('wifi');
  });
});
