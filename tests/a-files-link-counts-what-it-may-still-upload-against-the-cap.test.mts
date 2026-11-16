// A FILES LINK COUNTS WHAT IT MAY STILL UPLOAD AGAINST THE CAP.
//
// What was wrong (2026-11-14, daily security review): a link to keep a file in
// the cloud was refused only against the last weighed total, which the sweep
// refreshes every few minutes, and the signed link took any size. One Pro
// account took 60 of 60 links in a burst, room for 300 GB on a 100 GB plan.
// The person chose (2026-11-15): the app states each upload's size, the server
// counts links not yet used against the cap and signs that size into the link.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createGateway, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';
import { managedClients } from '../main/cloud/managed.mts';
import { awsStorage } from '../main/cloud/aws.mts';

const A = '11111111-1111-4111-8111-111111111111';
const GB = 2 ** 30;
// A file's name is the sha256 of its bytes: one stand-in per letter, in hex.
const hash = (c: string) => c.charCodeAt(0).toString(16).padStart(64, '0');

function setup() {
  let t = Date.UTC(2026, 10, 15, 12);
  const objects = memoryObjects();
  const signed: { key: string; size: unknown }[] = [];
  const gw = createGateway({
    agentcore: { async invoke() { return { ok: true }; }, async stop() {} },
    links: { get: async (k: string) => `get:${k}`, put: async (k: string, _s: number, size?: number) => { signed.push({ key: k, size }); return `put:${k}`; }, head: async (k: string) => `head:${k}` },
    removeObject: async (k: string) => { await objects.del(k); },
    objects,
    whoIs: async (token: string) => (token === 'session-of-a' ? { id: A } : null),
    now: () => t,
  });
  const call = async (method: string, p: string, { key, body }: { key?: string; body?: unknown } = {}) => gw.handle({ method, path: p, headers: key ? { authorization: `Bearer ${key}` } : {}, body: body ? JSON.stringify(body) : '' });
  const keyOf = async () => (await call('POST', '/v1/devices', { key: 'session-of-a', body: { name: 'Mac', acceptedTerms: TERMS_VERSION } })).body.key;
  const landed = async (h: string, bytes: number) => {
    await objects.put(`files/u-${A}/${h}`, '');
    const sizes = objects.sizes.bind(objects);
    objects.sizes = async (prefix: string, o: unknown) => {
      const out = await sizes(prefix, o);
      return { ...out, items: out.items.map((i: { key: string; size: number }) => (i.key.endsWith(h) ? { ...i, size: bytes } : i)) };
    };
  };
  return { gw, call, keyOf, signed, landed, later: (ms: number) => { t += ms; } };
}

const put = (s: ReturnType<typeof setup>, key: string, h: string, size?: number) =>
  s.call('POST', '/v1/link', { key, body: { op: 'put', key: `files/${h}`, ...(size === undefined ? {} : { size }) } });

describe('links to keep files', () => {
  it('stop once the uploads they allow would fill the plan, before anything is weighed', async () => {
    const s = setup();
    const key = await s.keyOf();
    await s.gw.admin({ do: 'plan', person: A, plan: 'pro' });
    const given: number[] = [];
    for (const c of 'abcdefghijklmnopqrstuvwxyz'.slice(0, 25)) given.push((await put(s, key, hash(c), 5 * GB)).status);
    expect(given.filter((st) => st === 200)).toHaveLength(20);
    expect((await put(s, key, hash('z'), 5 * GB)).body.error).toBe('files-full');
  });

  it('sign the size the app stated into the link', async () => {
    const s = setup();
    const key = await s.keyOf();
    await s.gw.admin({ do: 'plan', person: A, plan: 'pro' });
    await put(s, key, hash('a'), 1234);
    expect(s.signed.at(-1)).toEqual({ key: `files/u-${A}/${hash('a')}`, size: 1234 });
  });

  it('refuse a size no single upload can be', async () => {
    const s = setup();
    const key = await s.keyOf();
    await s.gw.admin({ do: 'plan', person: A, plan: 'pro' });
    expect((await put(s, key, hash('a'), 6 * GB)).status).toBe(400);
    expect((await put(s, key, hash('a'), -1)).status).toBe(400);
  });

  it('count a link with no size, from an older app, as the largest upload', async () => {
    const s = setup();
    const key = await s.keyOf();
    await s.gw.admin({ do: 'plan', person: A, plan: 'pro' });
    let ok = 0;
    for (const c of 'abcdefghijklmnopqrstuvwxy') if ((await put(s, key, hash(c))).status === 200) ok += 1;
    expect(ok).toBe(20);
  });

  it('count a file once it has landed, and only once', async () => {
    const s = setup();
    const key = await s.keyOf();
    await s.gw.admin({ do: 'plan', person: A, plan: 'pro' });
    for (const c of 'abcdefghijklmnopqrst') expect((await put(s, key, hash(c), 5 * GB)).status).toBe(200);
    for (const c of 'abcdefghijklmnopqrst') await s.landed(hash(c), c === 'a' ? 1 * GB : 0);
    s.later(10 * 60_000);
    expect((await s.call('GET', '/v1/files', { key })).body).toMatchObject({ bytes: 1 * GB, full: false });
    expect((await put(s, key, hash('u'), 5 * GB)).status).toBe(200);
  });

  it('asked again for the same file, count it once', async () => {
    const s = setup();
    const key = await s.keyOf();
    await s.gw.admin({ do: 'plan', person: A, plan: 'pro' });
    for (let i = 0; i < 30; i += 1) expect((await put(s, key, hash('a'), 5 * GB)).status).toBe(200);
  });

  it('let a pending link lapse once its time is up', async () => {
    const s = setup();
    const key = await s.keyOf();
    await s.gw.admin({ do: 'plan', person: A, plan: 'pro' });
    for (const c of 'abcdefghijklmnopqrst') await put(s, key, hash(c), 5 * GB);
    expect((await put(s, key, hash('u'), 5 * GB)).status).toBe(403);
    s.later(13 * 60 * 60_000);
    expect((await put(s, key, hash('u'), 5 * GB)).status).toBe(200);
  });
});

describe('the app asking for one', () => {
  let server: http.Server | null = null;
  afterEach(async () => {
    if (!server) return;
    server.closeAllConnections();
    await new Promise((r) => server!.close(r));
    server = null;
  });

  it('says the size of a file it keeps, and of nothing else', async () => {
    const asked: Record<string, unknown>[] = [];
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        if (req.url === '/v1/link') asked.push(JSON.parse(body));
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ url: `http://127.0.0.1:${(server!.address() as { port: number }).port}/bucket`, ok: true }));
      });
    });
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()));
    const { storage } = managedClients({ url: `http://127.0.0.1:${(server.address() as { port: number }).port}`, key: 'k', throttleMs: 2000 });
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'keep-')), 'film.mp4');
    fs.writeFileSync(file, 'x'.repeat(1234));
    await storage.putFile!(`files/${hash('a')}`, file);
    await storage.putFile!('runs/r1/out.bundle', file);
    expect(asked.map((a) => a.size)).toEqual([1234, undefined]);
  });

  it('gets a link signed for that size', async () => {
    const s3 = awsStorage({ region: 'us-east-1', bucket: 'b', credentials: { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'stand-in' } });
    const signedFor = async (size?: number) => new URL(await s3.putUrl('files/u-x/y', 60, size)).searchParams.get('X-Amz-SignedHeaders');
    expect(await signedFor(1234)).toMatch(/content-length/);
    expect(await signedFor()).not.toMatch(/content-length/);
  });
});
