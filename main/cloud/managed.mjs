// THE CLOUD THROUGH OUR SERVER, FOR A MAC WITH NO AWS ACCOUNT OF ITS OWN.
//
// The same two interfaces as main/cloud/aws.mjs (the session and the bucket),
// spoken to the cloud server (cloud/gateway/) with this Mac's cloud key. Files
// go straight to and from the bucket on links the server signs; the server
// only ever sees names. A sign-in is never read from here: a link to one is
// answered with its name, which the server turns into a link only inside a
// call to the sandbox.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { LOGIN_NAME } from '../../shared/cloud-login-name.mjs';

export { LOGIN_NAME };

// Longer than the server's own deadline (scripts/cloud-gateway-setup.mjs),
// so a slow start or collect is not given up here while it succeeds there. A
// file of a few hundred MB on a slow network takes minutes.
export const CALL_MS = 100_000;
const FILE_MS = 15 * 60_000;
const LINK_SECONDS = 12 * 60 * 60;
// Lambda takes at most 6 MB; a call past this goes through the bucket.
const RELAY_BYTES = 4 * 1024 * 1024;

const isLogin = (key) => String(key).startsWith('logins/');

export function managedClients({ url, key, timeoutMs = CALL_MS, fileTimeoutMs = FILE_MS, onSignedOut = () => {} }) {
  const base = String(url).replace(/\/+$/, '');

  async function call(method, path, body) {
    const init = {
      method,
      headers: { authorization: `Bearer ${key}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    };
    const res = await fetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) { try { onSignedOut(); } catch { /* the refusal below says it all the same */ } }
      throw Object.assign(new Error(`the cloud server said ${res.status}: ${out.message || out.error || 'no reason'}`), {
        status: res.status, error: out.error, said: out.message, signedOut: res.status === 401,
      });
    }
    return out;
  }
  const linkFor = async (op, k, seconds = LINK_SECONDS) => (await call('POST', '/v1/link', { op, key: k, seconds })).url;
  const object = (link, init = {}) => fetch(link, { ...init, signal: AbortSignal.timeout(fileTimeoutMs) });
  const refuseLogin = (k) => { if (isLogin(k)) throw new Error('a cloud sign-in is never read on this Mac'); };

  async function invoke(sessionId, payload) {
    let out;
    try {
      const text = JSON.stringify({ sessionId, payload });
      if (Buffer.byteLength(text) <= RELAY_BYTES) out = await call('POST', '/v1/invoke', { sessionId, payload });
      else {
        const payloadKey = `runs/calls/${crypto.randomUUID()}.json`;
        await storage.put(payloadKey, JSON.stringify(payload));
        out = await call('POST', '/v1/invoke', { sessionId, payloadKey });
      }
    } catch (err) {
      // A refusal is an answer: run.mjs retries what throws, some calls for
      // ever. A poll refused ends as a session that is gone does. A throttle
      // (429) or a server failure passes, so those are thrown and retried.
      if (!err.status || err.status === 429 || err.status >= 500) throw err;
      return { ok: false, error: payload?.action === 'events' ? 'no-run' : err.error || 'refused', message: err.message };
    }
    if (!out?.relayed) return out;
    const res = await object(out.relayed.url);
    if (!res.ok) throw new Error(`the bucket refused the cloud's answer: ${res.status}`);
    const answer = await res.json();
    await call('POST', '/v1/delete', { key: out.relayed.key }).catch(() => {});
    return answer;
  }

  const transport = {
    invoke,
    stop: (sessionId) => call('POST', '/v1/stop', { sessionId }),
  };

  const storage = {
    async put(k, body) {
      const res = await object(await linkFor('put', k), { method: 'PUT', body });
      if (!res.ok) throw new Error(`the bucket refused ${k}: ${res.status}`);
    },
    async putFile(k, file) { await storage.put(k, fs.readFileSync(file)); },
    async get(k) {
      refuseLogin(k);
      const res = await object(await linkFor('get', k));
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`the bucket refused ${k}: ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    },
    async getToFile(k, file) {
      refuseLogin(k);
      const res = await object(await linkFor('get', k));
      if (res.status === 404) return false;
      if (!res.ok) throw new Error(`the bucket refused ${k}: ${res.status}`);
      await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(file));
      return true;
    },
    async exists(k) {
      const res = await object(await linkFor('head', k), { method: 'HEAD' });
      if (res.status === 404) return false;
      if (!res.ok) throw new Error(`the bucket refused ${k}: ${res.status}`);
      return true;
    },
    async del(k) { await call('POST', '/v1/delete', { key: k }); },
    getUrl: async (k, seconds) => (isLogin(k) ? `${LOGIN_NAME}${k}` : linkFor('get', k, seconds)),
    // A sign-in is saved by the sandbox on a link the server makes from its name.
    putUrl: async (k, seconds) => (isLogin(k) ? `${LOGIN_NAME}${k}` : linkFor('put', k, seconds)),
  };

  return { transport, storage, me: () => call('GET', '/v1/me') };
}
