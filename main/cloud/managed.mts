// THE CLOUD THROUGH OUR SERVER, FOR A MAC WITH NO AWS ACCOUNT OF ITS OWN.
//
// The same two interfaces as main/cloud/aws.mts (the session and the bucket),
// spoken to the cloud server (cloud/gateway/) with this Mac's cloud key. Files
// go straight to and from the bucket on links the server signs; the server
// only ever sees names. A sign-in is never read from here: a link to one is
// answered with its name, which the server turns into a link only inside a
// call to the sandbox.
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { LOGIN_NAME } from '../../shared/cloud-login-name.mts';

export { LOGIN_NAME };

// Longer than the server's own deadline (scripts/cloud-gateway-setup.mjs),
// so a slow start or collect is not given up here while it succeeds there. A
// file of a few hundred MB on a slow network takes minutes.
export const CALL_MS = 100_000;
const FILE_MS = 15 * 60_000;
const LINK_SECONDS = 12 * 60 * 60;
// Lambda takes at most 6 MB; a call past this goes through the bucket.
const RELAY_BYTES = 4 * 1024 * 1024;
// Lambda answers 429 when the server has all the calls open it may, before
// running this one, so it is sent again for this long.
const THROTTLE_MS = 60_000;

export interface CloudEvent {
  seq: number;
  kind: string;
  data: string;
  conn: string;
  server?: string;
  line: string;
  message: string;
  state?: string;
  id?: string;
  at?: number;
  signal?: string;
  code?: number;
}

export interface CloudReply {
  ok?: boolean;
  error?: string;
  message?: string;
  url?: string;
  relayed?: { url: string; key: string };
  runId?: string;
  state?: string;
  caps?: string[];
  inSeq?: number;
  expect?: number;
  dup?: boolean;
  consumed?: boolean;
  events?: CloudEvent[];
  files?: unknown[];
  calls?: { conn: string; id: unknown; go: boolean }[];
}

export interface CloudPayload {
  action?: string;
  [field: string]: unknown;
}

export interface CloudTransport {
  invoke(sessionId: string, payload: CloudPayload): Promise<CloudReply>;
  stop?(sessionId: string): Promise<unknown>;
}

export interface CloudStorage {
  put(key: string, body: string | Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  getUrl(key: string, seconds?: number): Promise<string>;
  putUrl(key: string, seconds?: number): Promise<string>;
  exists?(key: string): Promise<boolean>;
  putFile?(key: string, file: string): Promise<void>;
  getToFile?(key: string, file: string): Promise<boolean>;
  extend?(key: string, base: string, file: string, start: number): Promise<void>;
  del?(key: string): Promise<void>;
}

export interface ManagedOptions {
  url: string;
  key: string;
  timeoutMs?: number;
  fileTimeoutMs?: number;
  throttleMs?: number;
  onSignedOut?: () => void;
}

export interface CloudCallError extends Error {
  status?: number;
  error?: string;
  said?: string;
  signedOut?: boolean;
}

const isLogin = (key: unknown) => String(key).startsWith('logins/');

// An upload, by node:http rather than fetch: fetch gives up on any request
// whose answer has not begun within 300 s, counted while the body is still
// going up, so a conversation of a few hundred MB on a slow uplink could never
// be sent. A file is streamed from disk. Resolves with the bucket's status.
function upload(link: string, body: { buffer: Buffer } | { file: string }, timeoutMs: number): Promise<number> {
  const url = new URL(link);
  const length = 'file' in body ? fs.statSync(body.file).size : body.buffer.length;
  return new Promise((resolve, reject) => {
    const req = (url.protocol === 'https:' ? https : http).request(url, {
      method: 'PUT', headers: { 'content-length': length }, signal: AbortSignal.timeout(timeoutMs),
    }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode ?? 0));
      res.on('error', reject);
    });
    req.on('error', reject);
    if ('file' in body) pipeline(fs.createReadStream(body.file), req).catch(reject);
    else req.end(body.buffer);
  });
}

export function managedClients({ url, key, timeoutMs = CALL_MS, fileTimeoutMs = FILE_MS, throttleMs = THROTTLE_MS, onSignedOut = () => {} }: ManagedOptions) {
  const base = String(url).replace(/\/+$/, '');

  async function call(method: string, path: string, body?: unknown): Promise<CloudReply> {
    const init: RequestInit = {
      method,
      headers: { authorization: `Bearer ${key}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    };
    const until = Date.now() + throttleMs;
    let res = await fetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    for (let wait = 250; res.status === 429 && Date.now() < until; wait = Math.min(wait * 2, 8000)) {
      await res.body?.cancel();
      await new Promise((r) => setTimeout(r, Math.min(until - Date.now(), wait * (0.5 + Math.random()))));
      res = await fetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    }
    const out = await res.json().catch(() => ({})) as CloudReply;
    if (!res.ok) {
      if (res.status === 401) { try { onSignedOut(); } catch { /* the refusal below says it all the same */ } }
      throw Object.assign(new Error(`the cloud server said ${res.status}: ${out.message || out.error || 'no reason'}`), {
        status: res.status, error: out.error, said: out.message, signedOut: res.status === 401,
      });
    }
    return out;
  }
  // A link is only a signature, so one lost to a dropped connection or a
  // server failure is asked for again; a refusal is an answer.
  async function linkFor(op: string, k: string, seconds: number = LINK_SECONDS): Promise<string> {
    const until = Date.now() + throttleMs;
    for (let wait = 250; ; wait = Math.min(wait * 2, 8000)) {
      try { return (await call('POST', '/v1/link', { op, key: k, seconds })).url as string; } catch (e) {
        const err = e as CloudCallError;
        if ((err.status && err.status < 500) || Date.now() >= until) throw err;
        await new Promise((r) => setTimeout(r, Math.min(until - Date.now(), wait * (0.5 + Math.random()))));
      }
    }
  }
  const object = (link: string, init: RequestInit = {}) => fetch(link, { ...init, signal: AbortSignal.timeout(fileTimeoutMs) });
  const refuseLogin = (k: string) => { if (isLogin(k)) throw new Error('a cloud sign-in is never read on this Mac'); };

  async function invoke(sessionId: string, payload: CloudPayload): Promise<CloudReply> {
    let out: CloudReply;
    try {
      const text = JSON.stringify({ sessionId, payload });
      if (Buffer.byteLength(text) <= RELAY_BYTES) out = await call('POST', '/v1/invoke', { sessionId, payload });
      else {
        const payloadKey = `runs/calls/${crypto.randomUUID()}.json`;
        await storage.put(payloadKey, JSON.stringify(payload));
        out = await call('POST', '/v1/invoke', { sessionId, payloadKey });
      }
    } catch (e) {
      const err = e as CloudCallError;
      // A refusal is an answer: run.mts retries what throws, some calls for
      // ever. A poll refused ends as a session that is gone does. A throttle
      // (429) or a server failure passes, so those are thrown and retried.
      if (!err.status || err.status === 429 || err.status >= 500) throw err;
      return { ok: false, error: payload?.action === 'events' ? 'no-run' : err.error || 'refused', message: err.message };
    }
    if (!out?.relayed) return out;
    const res = await object(out.relayed.url);
    if (!res.ok) throw new Error(`the bucket refused the cloud's answer: ${res.status}`);
    const answer = await res.json() as CloudReply;
    await call('POST', '/v1/delete', { key: out.relayed.key }).catch(() => {});
    return answer;
  }

  const transport: CloudTransport = {
    invoke,
    stop: (sessionId: string) => call('POST', '/v1/stop', { sessionId }),
  };

  const storage: CloudStorage = {
    async put(k: string, body: string | Buffer) {
      const status = await upload(await linkFor('put', k), { buffer: Buffer.from(body) }, fileTimeoutMs);
      if (status < 200 || status > 299) throw new Error(`the bucket refused ${k}: ${status}`);
    },
    async putFile(k: string, file: string) {
      const status = await upload(await linkFor('put', k), { file }, fileTimeoutMs);
      if (status < 200 || status > 299) throw new Error(`the bucket refused ${k}: ${status}`);
    },
    async get(k: string) {
      refuseLogin(k);
      const res = await object(await linkFor('get', k));
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`the bucket refused ${k}: ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    },
    async getToFile(k: string, file: string) {
      refuseLogin(k);
      const res = await object(await linkFor('get', k));
      if (res.status === 404) return false;
      if (!res.ok) throw new Error(`the bucket refused ${k}: ${res.status}`);
      await pipeline(Readable.fromWeb(res.body!), fs.createWriteStream(file));
      return true;
    },
    async exists(k: string) {
      const res = await object(await linkFor('head', k), { method: 'HEAD' });
      if (res.status === 404) return false;
      if (!res.ok) throw new Error(`the bucket refused ${k}: ${res.status}`);
      return true;
    },
    async del(k: string) { await call('POST', '/v1/delete', { key: k }); },
    getUrl: async (k: string, seconds?: number) => (isLogin(k) ? `${LOGIN_NAME}${k}` : linkFor('get', k, seconds)),
    // A sign-in is saved by the sandbox on a link the server makes from its name.
    putUrl: async (k: string, seconds?: number) => (isLogin(k) ? `${LOGIN_NAME}${k}` : linkFor('put', k, seconds)),
  };

  return { transport, storage, me: () => call('GET', '/v1/me') };
}
