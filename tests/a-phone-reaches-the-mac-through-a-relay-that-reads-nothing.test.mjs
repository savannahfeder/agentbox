// A PHONE ANYWHERE, WITH NOTHING TO INSTALL (2026-10-12). Phones could reach
// the inbox only on the same Wi-Fi, or over Tailscale, which meant installing
// it on both and changing its admin settings: "I would strongly advise against
// them having to download some other service", and "yes go ahead with
// cloudflare". So the Mac connects out to a small relay (relay/worker.mjs, on
// Cloudflare), the phone talks to the same relay, and the relay hands sealed
// bytes from one to the other.
//
// What has to hold, and what this proves in one process with the Mac's real
// phone server, the relay's real room and the phone's real tunnel:
// - the phone gets the same answers it gets on the Wi-Fi: the page, the api,
//   the live event stream, a picture;
// - the relay sees no key, no token and no word of what passes through it;
// - a request it records and sends again, or alters, does nothing;
// - a Mac that is not there is said in words, not as a blank page.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createHandler, newToken } from '../main/serve.mjs';
import { relayIds, relayKeys, seal, open, macMayJoin } from '../shared/relay-crypto.mjs';
import { Room } from '../relay/room.mjs';
import { createRelayClient } from '../main/relay-client.mts';
import { tunnelFetch } from '../relay/phone/tunnel.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 3000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await wait(10); } return false; };
const text = (bytes) => Buffer.from(bytes).toString('latin1');

describe('the keys', () => {
  it('seal and open, and refuse what was altered or sealed for something else', async () => {
    const { up } = await relayKeys('a-key-of-at-least-24-chars!!');
    const sealed = await seal(up, new TextEncoder().encode('hello'), 'req');
    expect(new TextDecoder().decode(await open(up, sealed, 'req'))).toBe('hello');
    const bent = sealed.slice(); bent[bent.length - 1] ^= 1;
    await expect(open(up, bent, 'req')).rejects.toThrow();
    await expect(open(up, sealed, 'res:x:0')).rejects.toThrow();
    const { up: other } = await relayKeys('another-key-of-24-chars-ok!!');
    await expect(open(other, sealed, 'req')).rejects.toThrow();
  });

  it('name a room the relay can check the Mac against, and that names no key', async () => {
    const key = 'a-key-of-at-least-24-chars!!';
    const a = await relayIds(key);
    const b = await relayIds(key);
    expect(a).toEqual(b);
    expect(a.room).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.room).not.toContain(key);
    expect(await macMayJoin(a.room, a.proof)).toBe(true);
    expect(await macMayJoin(a.room, 'not-the-proof')).toBe(false);
    expect((await relayIds('another-key-of-24-chars-ok!!')).room).not.toBe(a.room);
  });
});

/** A WebSocket for the Mac's client whose other end is the relay's room. */
function socketTo(room, seen) {
  return class FakeSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.binaryType = 'blob';
      const self = this;
      this.peer = { send: (bytes) => { if (self.readyState === 1) self.onmessage?.({ data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }); }, close: () => self.close() };
      queueMicrotask(async () => {
        const u = new URL(url);
        const [, , roomName] = u.pathname.split('/');
        if (!(await macMayJoin(roomName, u.searchParams.get('proof')))) { this.readyState = 3; this.onclose?.({ code: 4001 }); return; }
        this.readyState = 1;
        room.connectMac(this.peer);
        this.onopen?.();
      });
    }
    send(data) { const bytes = new Uint8Array(data); seen.push(bytes); room.fromMac(bytes); }
    close() { if (this.readyState === 3) return; this.readyState = 3; room.macGone(this.peer); this.onclose?.({ code: 1000 }); }
  };
}

let server, port, key, root, dist, room, client, ctx, seenByRelay, listeners, calls;

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-files-'));
  dist = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-dist-'));
  fs.writeFileSync(path.join(dist, 'index.html'), '<p>the inbox page</p>');
  fs.writeFileSync(path.join(root, 'big.png'), Buffer.alloc(1_500_000, 9));
  key = newToken();
  listeners = new Set();
  calls = 0;
  const channels = new Map([['zero:snapshot', async (_e, p) => { calls += 1; return { items: [{ title: 'secret plans' }], asked: p }; }]]);
  const inner = createHandler({ channels, token: () => key, listeners, dist, files: { allows: (_k, f) => f.startsWith(root) } });
  server = http.createServer(inner);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;

  room = new Room();
  seenByRelay = [];
  client = createRelayClient({ relayUrl: 'https://relay.test', key: () => key, port: () => port, WebSocketImpl: socketTo(room, seenByRelay), log: { warn() {}, info() {} } });
  client.start();
  await until(() => client.state().connected);
  const { room: roomName } = await relayIds(key);
  ctx = { room: roomName, keys: await relayKeys(key) };
});
afterAll(() => { client?.stop(); server?.close(); for (const d of [root, dist]) fs.rmSync(d, { recursive: true, force: true }); });

/** The phone's fetch: to the relay, which here is the room itself. */
const phoneFetch = (sentByPhone) => async (url, init) => {
  const body = new Uint8Array(await new Response(init.body).arrayBuffer());
  sentByPhone?.push(body);
  return room.fromPhone(body, init.signal);
};
const ask = (pathname, init = {}, sent) => tunnelFetch(new Request(`https://relay.test${pathname}`, init), ctx, phoneFetch(sent));

describe('through the relay, the phone gets what it gets on the Wi-Fi', () => {
  it('the page', async () => {
    const res = await ask('/');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('the inbox page');
  });

  it('a channel, with its key', async () => {
    const res = await ask('/api/zero:snapshot', { method: 'POST', headers: { 'content-type': 'application/json', 'x-agentbox-token': key }, body: JSON.stringify({ hi: 1 }) });
    expect(res.status).toBe(200);
    expect((await res.json()).items[0].title).toBe('secret plans');
  });

  it('and is refused one without it, as on the Wi-Fi', async () => {
    const res = await ask('/api/zero:snapshot', { method: 'POST', body: '{}' });
    expect(res.status).toBe(403);
  });

  it('the live stream, as things happen', async () => {
    const res = await ask(`/events?token=${key}&device=phone-1`);
    expect(res.status).toBe(200);
    const reader = res.body.getReader();
    await until(() => listeners.size > 0);
    for (const send of listeners) send({ channel: 'zero:update', args: [{ n: 7 }] });
    let got = '';
    const end = Date.now() + 3000;
    while (!got.includes('zero:update') && Date.now() < end) {
      const { value, done } = await reader.read();
      if (done) break;
      got += new TextDecoder().decode(value);
    }
    expect(got).toContain('"n":7');
    await reader.cancel();
    expect(await until(() => listeners.size === 0)).toBe(true);
  });

  it('an upload bigger than one socket message, whole: a photo the phone attaches', async () => {
    // A phone posts a picture whole, as base64 (renderer/src/attachments.ts).
    // Cloudflare's sockets carry a message of 1 MB at most, so the room sends
    // a big request to the computer in pieces (2026-10-12).
    const sent = [];
    const fromRoom = [];
    const mac = room.mac;
    const spy = { send: (b) => { fromRoom.push(b.length); mac.send(b); }, close: () => mac.close() };
    room.mac = spy;
    try {
      const photo = 'x'.repeat(3_000_000);
      const res = await ask('/api/zero:snapshot', { method: 'POST', headers: { 'content-type': 'application/json', 'x-agentbox-token': key }, body: JSON.stringify({ photo }) }, sent);
      expect(res.status).toBe(200);
      expect((await res.json()).asked.photo.length).toBe(3_000_000);
      expect(Math.max(...fromRoom)).toBeLessThanOrEqual(600 * 1024);
      expect(fromRoom.length).toBeGreaterThan(4);
    } finally {
      room.mac = mac;
    }
  });

  it('a picture bigger than one message, whole', async () => {
    const kr = await ask('/file-key', { headers: { 'x-agentbox-token': key } });
    const { key: fk } = await kr.json();
    const res = await ask(`/f/${fk}/img${path.join(root, 'big.png').split('/').map(encodeURIComponent).join('/')}`);
    expect(res.status).toBe(200);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes.length).toBe(1_500_000);
    expect(bytes.every((b) => b === 9)).toBe(true);
  });
});

describe('the relay reads nothing', () => {
  it('no key, no token and no word of the answer crosses it in the clear', async () => {
    const sent = [];
    seenByRelay.length = 0;
    await (await ask('/api/zero:snapshot', { method: 'POST', headers: { 'x-agentbox-token': key, 'content-type': 'application/json' }, body: '{"q":"what the phone asked"}' }, sent)).json();
    const all = [...sent, ...seenByRelay].map(text).join('');
    for (const secret of [key, 'secret plans', 'what the phone asked', 'zero:snapshot', 'x-agentbox-token']) expect(all).not.toContain(secret);
  });
});

describe('a request recorded or altered on the way does nothing', () => {
  it('sent again, it is refused and the Mac does not act twice', async () => {
    const sent = [];
    await (await ask('/api/zero:snapshot', { method: 'POST', headers: { 'x-agentbox-token': key }, body: '{}' }, sent)).json();
    const before = calls;
    const again = await room.fromPhone(sent[0]);
    expect(again.status).toBe(400);
    expect(calls).toBe(before);
  });

  it('altered, it is refused', async () => {
    const sent = [];
    await (await ask('/api/zero:snapshot', { method: 'POST', headers: { 'x-agentbox-token': key }, body: '{}' }, sent)).json();
    const bent = sent[0].slice(); bent[bent.length - 5] ^= 1;
    const before = calls;
    expect((await room.fromPhone(bent)).status).toBe(400);
    expect(calls).toBe(before);
  });

  it('an answer meant for one request is not taken for another', async () => {
    const { down } = ctx.keys;
    const frame = await seal(down, new Uint8Array([0, 1, 2]), 'res:some-other-request:0');
    await expect(open(down, frame, 'res:this-request:0')).rejects.toThrow();
  });
});

describe('with the Mac away', () => {
  it('the phone is told in words, and a channel says so plainly', async () => {
    const lonely = new Room();
    const page = await tunnelFetch(new Request('https://relay.test/', { headers: { accept: 'text/html' } }), ctx, async (_u, init) => lonely.fromPhone(new Uint8Array(await new Response(init.body).arrayBuffer())));
    expect(page.status).toBe(503);
    // "computer", not "Mac": the app runs on Linux too (the-screens-never-name-a-mac).
    expect(await page.text()).toMatch(/Your computer is not connected/);
    const api = await tunnelFetch(new Request('https://relay.test/api/zero:snapshot', { method: 'POST', body: '{}' }), ctx, async (_u, init) => lonely.fromPhone(new Uint8Array(await new Response(init.body).arrayBuffer())));
    expect(api.status).toBe(503);
    expect((await api.json()).error).toMatch(/computer is not connected/);
  });

  it('a Mac without the room\'s proof cannot take its place', async () => {
    const { room: roomName } = await relayIds(key);
    expect(await macMayJoin(roomName, (await relayIds(newToken())).proof)).toBe(false);
  });

  it('a Mac that leaves mid-answer ends the phone\'s stream instead of leaving it hanging', async () => {
    const res = await ask(`/events?token=${key}&device=phone-2`);
    const reader = res.body.getReader();
    await until(() => listeners.size > 0);
    client.stop();
    const drain = (async () => { try { for (;;) { const { done } = await reader.read(); if (done) return 'ended'; } } catch { return 'ended'; } })();
    const end = await Promise.race([drain, wait(2000).then(() => 'hung')]);
    expect(end).toBe('ended');
    client.start();
    expect(await until(() => client.state().connected)).toBe(true);
  });
});
