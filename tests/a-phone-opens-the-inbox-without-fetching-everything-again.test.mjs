// "QUITE OFTEN IT JUST SAYS 'AGENTBOX IS NOT ANSWERING' WHEN I'M LOADING ON MY
// PHONE, BEFORE LOADING A FEW SECONDS LATER. ALSO LOAD TIME IS TOO LONG"
// (w-f430aa863d, 2026-10-28).
//
// Measured on main at 396c77f: every open of the phone fetched the screen's
// 2.5 MB of script and style from her computer through the relay, never kept,
// and then the inbox, 1.47 MB of json for one of her projects alone, both
// exactly as they left the phone server. A first read that missed waited for
// the next poll, 30 seconds on a phone. What holds now:
// - words cross the relay squeezed, to a phone that says it can open them, and
//   arrive as they were;
// - a phone or a computer from before this is sent them as before;
// - the live stream is never squeezed, because gzip holds bytes back;
// - the phone keeps the screen's own files, and nothing else;
// - on the Wi-Fi the same files are marked as kept for good, and the page is not;
// - a first read that missed is asked again in seconds.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createHandler, newToken } from '../main/serve.mjs';
import { relayIds, relayKeys, macMayJoin } from '../shared/relay-crypto.mjs';
import { Room } from '../relay/room.mjs';
import { createRelayClient, squeezes } from '../main/relay-client.mjs';
import { tunnelFetch } from '../relay/phone/tunnel.mjs';
import { isScreenFile, mayKeep } from '../relay/phone/kept.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 3000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await wait(10); } return false; };

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

// An inbox shaped like hers: rows of words, many of them alike.
const INBOX = { items: Array.from({ length: 400 }, (_, i) => ({ id: `w-${i}`, title: `Row ${i} about the landing page`, body: 'The first line of the body is the ask, in bold, and nothing else. '.repeat(20) })) };
const SCRIPT = 'function drawTheInbox(){return "rows"}\n'.repeat(20_000);

let server, port, key, dist, room, client, ctx, fromMac;

beforeAll(async () => {
  dist = fs.mkdtempSync(path.join(os.tmpdir(), 'kept-dist-'));
  fs.writeFileSync(path.join(dist, 'index.html'), '<p>the inbox page</p>');
  fs.mkdirSync(path.join(dist, 'assets'));
  fs.writeFileSync(path.join(dist, 'assets', 'main-abc123.js'), SCRIPT);
  key = newToken();
  const channels = new Map([['zero:snapshot', async () => INBOX]]);
  server = http.createServer(createHandler({ channels, token: () => key, listeners: new Set(), dist }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
  room = new Room();
  fromMac = [];
  client = createRelayClient({ relayUrl: 'https://relay.test', key: () => key, port: () => port, WebSocketImpl: socketTo(room, fromMac), log: { warn() {}, info() {} } });
  client.start();
  await until(() => client.state().connected);
  const { room: roomName } = await relayIds(key);
  ctx = { room: roomName, keys: await relayKeys(key) };
});
afterAll(() => { client?.stop(); server?.close(); fs.rmSync(dist, { recursive: true, force: true }); });

const phoneFetch = async (_url, init) => room.fromPhone(new Uint8Array(await new Response(init.body).arrayBuffer()), init.signal);
const ask = (pathname, init = {}) => tunnelFetch(new Request(`https://relay.test${pathname}`, init), ctx, phoneFetch);
const readInbox = () => ask('/api/zero:snapshot', { method: 'POST', headers: { 'content-type': 'application/json', 'x-agentbox-token': key }, body: '{}' });
/** What the computer put on the relay for one request. */
async function carried(go) {
  fromMac.length = 0;
  const out = await go();
  return { out, bytes: fromMac.reduce((n, b) => n + b.length, 0) };
}

describe('through the relay, words go squeezed', () => {
  it('the inbox arrives whole, in under a third of the bytes', async () => {
    const raw = JSON.stringify(INBOX).length;
    const { out, bytes } = await carried(async () => (await readInbox()).json());
    expect(out).toEqual(INBOX);
    expect(bytes).toBeLessThan(raw / 3);
  });

  it('and so does the screen, with its own type and no word of the squeezing', async () => {
    const { out, bytes } = await carried(async () => {
      const res = await ask('/assets/main-abc123.js');
      return { type: res.headers.get('content-type'), zip: res.headers.get('x-agentbox-zip'), text: await res.text() };
    });
    expect(out.text).toBe(SCRIPT);
    expect(out.type).toMatch(/javascript/);
    expect(out.zip).toBeNull();
    expect(bytes).toBeLessThan(SCRIPT.length / 3);
  });

  it('a phone that cannot open gzip is sent them as before', async () => {
    const had = globalThis.DecompressionStream;
    globalThis.DecompressionStream = undefined;
    try {
      const raw = JSON.stringify(INBOX).length;
      const { out, bytes } = await carried(async () => (await readInbox()).json());
      expect(out).toEqual(INBOX);
      expect(bytes).toBeGreaterThan(raw);
    } finally {
      globalThis.DecompressionStream = had;
    }
  });

  it('only words, and never the live stream', () => {
    const asked = { zip: 'gzip' };
    expect(squeezes(asked, 'application/json')).toBe(true);
    expect(squeezes(asked, 'text/css; charset=utf-8')).toBe(true);
    expect(squeezes(asked, 'text/event-stream')).toBe(false);
    expect(squeezes(asked, 'image/png')).toBe(false);
    expect(squeezes({}, 'application/json')).toBe(false);
  });
});

describe('the phone keeps the screen, and nothing else', () => {
  const req = (p, method = 'GET') => [{ method }, new URL(`https://relay.test${p}`)];
  it('the built files, by name', () => {
    expect(isScreenFile(...req('/assets/main-BFR0oBPv.js'))).toBe(true);
    expect(isScreenFile(...req('/assets/Geist-Variable-Bj2R_7yk.woff2'))).toBe(true);
  });
  it('never the page, the inbox, her files or a send', () => {
    expect(isScreenFile(...req('/'))).toBe(false);
    expect(isScreenFile(...req('/index.html'))).toBe(false);
    expect(isScreenFile(...req('/api/zero:snapshot', 'POST'))).toBe(false);
    expect(isScreenFile(...req('/f/key/img/Users/x/a.png'))).toBe(false);
    expect(isScreenFile(...req('/assets/main.js', 'POST'))).toBe(false);
  });
  it('and never the page answered in place of a file it does not have', async () => {
    const res = await ask('/assets/gone-from-an-older-build.js');
    expect(res.status).toBe(200);
    expect(mayKeep(res)).toBe(false);
    expect(mayKeep(new Response('x', { headers: { 'content-type': 'text/javascript' } }))).toBe(true);
    expect(mayKeep(new Response('x', { status: 502, headers: { 'content-type': 'application/json' } }))).toBe(false);
  });
});

describe('on the Wi-Fi', () => {
  const get = (p) => fetch(`http://127.0.0.1:${port}${p}`);
  it('the built files are marked as kept for good', async () => {
    expect((await get('/assets/main-abc123.js')).headers.get('cache-control')).toMatch(/immutable/);
  });
  it('and the page, or the page answered for a missing file, is not', async () => {
    expect((await get('/')).headers.get('cache-control') ?? '').not.toMatch(/immutable/);
    expect((await get('/assets/missing.js')).headers.get('cache-control') ?? '').not.toMatch(/immutable/);
  });
});

describe('a first read that missed', () => {
  it('is asked again in seconds, not at the next poll', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toMatch(/const FIRST_READ_AGAIN_MS = 1_500;/);
    expect(app).toMatch(/refresh\(\)\.catch\(\(\) => \{ if \(!gone\) again = setTimeout\(first, FIRST_READ_AGAIN_MS\); \}\)/);
    expect(app).toMatch(/setInterval\(refresh, pollEvery\(10_000, onPhone\(\)\)\)/);
  });
});
