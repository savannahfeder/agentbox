// AN UPLOAD TO THE CLOUD BUCKET MAY TAKE LONGER THAN FIVE MINUTES.
//
// 2026-11-08 (w-1fd4046a29): with the cloud on Everything, nothing ran there
// for a quarter of an hour. A thread's start sends its whole conversation
// (391 MB for one, 215 MB for another) and this Mac uploads at about 16 Mbps,
// so the send took close to five minutes. Node's fetch ends any request whose
// response headers have not come back in 300 s, counted while the body is
// still going up, and says only "fetch failed" (measured: a 40 MB PUT read at
// 100 KB/s failed at 301 s with UND_ERR_HEADERS_TIMEOUT, under a 15 minute
// AbortSignal). Each start died at about 5 min 10 s and was started again,
// holding the one cloud start the failures had left, so every other thread
// read Queued. Here the 300 s limit is shortened to one second, so an upload
// of a few seconds stands in for one of six minutes.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Agent, getGlobalDispatcher, setGlobalDispatcher } from 'undici';
import { managedClients } from '../main/cloud/managed.mts';

const KB = 1024;
let had; let bucket; let gateway; let store; let rate; let tmp;

const listen = (s) => new Promise((r) => s.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${s.address().port}`)));
const shut = (s) => { s.closeAllConnections(); return new Promise((r) => s.close(r)); };

beforeAll(() => {
  had = getGlobalDispatcher();
  setGlobalDispatcher(new Agent({ headersTimeout: 1000 }));
});
afterAll(() => setGlobalDispatcher(had));

let clients;
beforeEach(async () => {
  store = new Map();
  rate = 64 * KB;
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'slow-upload-'));
  // A bucket that takes `rate` bytes every 100 ms, as a slow uplink would.
  bucket = http.createServer((req, res) => {
    const k = decodeURIComponent(req.url.slice(1));
    if (k.startsWith('forbidden/')) { req.resume(); return req.on('end', () => { res.writeHead(403); res.end(); }); }
    const chunks = [];
    req.on('data', (c) => {
      chunks.push(c);
      req.pause();
      setTimeout(() => req.resume(), (c.length / rate) * 100);
    });
    req.on('end', () => { store.set(k, Buffer.concat(chunks)); res.writeHead(200); res.end(); });
  });
  const bucketUrl = await listen(bucket);
  gateway = http.createServer((req, res) => {
    let b = '';
    req.on('data', (c) => { b += c; });
    req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ url: `${bucketUrl}/${encodeURIComponent(JSON.parse(b).key)}` })); });
  });
  const at = await listen(gateway);
  clients = (fileTimeoutMs = 20_000) => managedClients({ url: at, key: 'abk_x', fileTimeoutMs });
});
afterEach(async () => {
  await shut(bucket);
  await shut(gateway);
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('sending to the bucket', () => {
  it('a body that takes longer to go up than the fetch header limit still arrives whole', async () => {
    const body = Buffer.alloc(1200 * KB, 7);
    const started = Date.now();
    await clients().storage.put('runs/r1/files/1', body);
    expect(Date.now() - started).toBeGreaterThan(1500);
    expect(store.get('runs/r1/files/1').equals(body)).toBe(true);
  }, 30_000);

  it('a file goes up from disk, slowly, and arrives byte for byte', async () => {
    const file = path.join(tmp, 'conversation.jsonl');
    const body = Buffer.from(Array.from({ length: 100_000 }, (_, i) => `{"line":${i}}\n`).join(''));
    fs.writeFileSync(file, body);
    const started = Date.now();
    await clients().storage.putFile('runs/r1/conversation.jsonl', file);
    expect(Date.now() - started).toBeGreaterThan(1500);
    expect(store.get('runs/r1/conversation.jsonl').equals(body)).toBe(true);
  }, 30_000);

  it('a small body goes up as before', async () => {
    await clients().storage.put('runs/r1/files/2', 'hello');
    expect(store.get('runs/r1/files/2').toString()).toBe('hello');
  });

  it('an upload still ends at its own deadline', async () => {
    rate = 8 * KB;
    await expect(clients(800).storage.put('runs/r1/files/3', Buffer.alloc(400 * KB, 1))).rejects.toThrow();
    expect(store.has('runs/r1/files/3')).toBe(false);
  }, 30_000);

  it('a bucket that refuses is still an error', async () => {
    await expect(clients().storage.put('forbidden/x', 'no')).rejects.toThrow(/403/);
  });
});
