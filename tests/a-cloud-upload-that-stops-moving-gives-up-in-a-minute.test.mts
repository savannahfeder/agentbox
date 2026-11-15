// A CLOUD UPLOAD THAT STOPS MOVING GIVES UP IN A MINUTE, NOT FIFTEEN.
//
// 2026-11-09 (w-edcbb422f4): a reply on a long thread started a cloud run at
// 14:01. Its window read "Thinking 9m in the cloud" and "No commands yet" for
// the whole run, which ended at 14:16:31, 15 min 9 s after it started, with
// "agentbox cloud: stopped: The operation was aborted". That is the upload's
// 15 minute AbortSignal firing on node:http (fetch words the same timeout
// differently). The network was failing that hour (another start died on
// "fetch failed"), so the send stopped moving early and then waited out the
// whole deadline, while the thread looked like an agent thinking.
//
// An upload now also ends when no byte has gone out and no answer has come for
// `stallMs`. Here that is shortened so a stall of a minute is a stall of 400 ms.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { managedClients } from '../main/cloud/managed.mts';

const KB = 1024;
const MB = 1024 * KB;
type Bucket = 'reads-nothing' | 'never-answers' | 'slow-but-moving' | 'normal';
let mode: Bucket;
let store: Map<string, Buffer>;
let bucket: http.Server; let gateway: http.Server; let tmp: string; let at: string;

const listen = (s: http.Server) => new Promise<string>((r) => s.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${(s.address() as AddressInfo).port}`)));
const shut = (s: http.Server) => { s.closeAllConnections(); return new Promise((r) => s.close(r)); };
const clients = (stallMs = 400, fileTimeoutMs = 20_000) => managedClients({ url: at, key: 'abk_x', fileTimeoutMs, stallMs });

beforeEach(async () => {
  store = new Map();
  mode = 'normal';
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stalled-upload-'));
  bucket = http.createServer((req, res) => {
    const k = decodeURIComponent(req.url!.slice(1));
    if (mode === 'reads-nothing') { req.pause(); return; }
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      chunks.push(c);
      if (mode !== 'slow-but-moving') return;
      // 16 MB a second: never still for long, but slower than the stall limit in total.
      req.pause();
      setTimeout(() => req.resume(), (c.length / (16 * MB)) * 1000);
    });
    req.on('end', () => {
      if (mode === 'never-answers') return;
      store.set(k, Buffer.concat(chunks)); res.writeHead(200); res.end();
    });
  });
  const bucketUrl = await listen(bucket);
  gateway = http.createServer((req, res) => {
    let b = '';
    req.on('data', (c) => { b += c; });
    req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ url: `${bucketUrl}/${encodeURIComponent(JSON.parse(b).key)}` })); });
  });
  at = await listen(gateway);
});
afterEach(async () => {
  await shut(bucket);
  await shut(gateway);
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('an upload whose connection stops moving', () => {
  it('ends soon after the bytes stop going out, long before its whole deadline', async () => {
    mode = 'reads-nothing';
    const started = Date.now();
    await expect(clients().storage.put('runs/r1/files/1', Buffer.alloc(64 * MB, 1))).rejects.toThrow(/stalled/);
    expect(Date.now() - started).toBeLessThan(5000);
  }, 30_000);

  it('ends the same way for a file sent from disk', async () => {
    mode = 'reads-nothing';
    const file = path.join(tmp, 'conversation.jsonl');
    fs.writeFileSync(file, Buffer.alloc(64 * MB, 2));
    const started = Date.now();
    await expect(clients().storage.putFile('runs/r1/conversation.jsonl', file)).rejects.toThrow(/stalled/);
    expect(Date.now() - started).toBeLessThan(5000);
  }, 30_000);

  it('ends when the whole body went up and the bucket never answers', async () => {
    mode = 'never-answers';
    const started = Date.now();
    await expect(clients().storage.put('runs/r1/files/2', 'hello')).rejects.toThrow(/stalled/);
    expect(Date.now() - started).toBeLessThan(5000);
  }, 30_000);
});

describe('an upload that keeps moving', () => {
  // The tail of a body sits in the system's buffers, unseen, until the bucket
  // reads it. On Linux loopback that grew to about 15 MB (1.5 MB on a Mac), so
  // at this rate the last 0.75 s look still: the stall limit is well over that
  // and the body takes about twice the limit.
  it('is not cut off when it takes longer than the stall limit in total', async () => {
    mode = 'slow-but-moving';
    const body = Buffer.alloc(96 * MB, 3);
    const started = Date.now();
    await clients(2500).storage.put('runs/r1/files/3', body);
    expect(Date.now() - started).toBeGreaterThan(3500);
    expect(store.get('runs/r1/files/3')!.equals(body)).toBe(true);
  }, 30_000);

  it('the same for a file sent from disk', async () => {
    mode = 'slow-but-moving';
    const file = path.join(tmp, 'conversation.jsonl');
    const body = Buffer.alloc(96 * MB, 4);
    fs.writeFileSync(file, body);
    const started = Date.now();
    await clients(2500).storage.putFile('runs/r1/conversation.jsonl', file);
    expect(Date.now() - started).toBeGreaterThan(3500);
    expect(store.get('runs/r1/conversation.jsonl')!.equals(body)).toBe(true);
  }, 30_000);

  it('a small body goes up as before', async () => {
    await clients().storage.put('runs/r1/files/4', 'hello');
    expect(store.get('runs/r1/files/4')!.toString()).toBe('hello');
  });

  it('the default stall limit is a minute', async () => {
    const { UPLOAD_STALL_MS } = await import('../main/cloud/managed.mts');
    expect(UPLOAD_STALL_MS).toBe(60_000);
  });
});
