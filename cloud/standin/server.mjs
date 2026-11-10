#!/usr/bin/env node
// A TEAM CLOUD ON ONE MACHINE, FOR THE TEAM LOOP.
//
//   node cloud/standin/server.mjs --port 54900 --file /tmp/lumen/cloud.json
//
// The in-memory cloud (main/team/memory-cloud.mts) behind a small HTTP door, so
// several copies of the app can be different people on one team without the
// hosted database. It listens on loopback only and trusts whoever knocks: a
// person's token is their id.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createMemoryCloud, memoryBackend, signUpMemory } from '../../main/team/memory-cloud.mts';
import { attachLiveRooms } from '../live/server.mjs';

const BIG = 100_000;

// Maps, Sets, bytes (a shared film's pieces) and large strings (every shared
// picture, in base64) out of JSON. Bytes and a big string go in a file of their
// own named by their hash, so a save never rewrites what it wrote last time.
export function pack(value, blobs) {
  if (Buffer.isBuffer(value)) {
    const name = crypto.createHash('sha256').update(value).digest('hex');
    const file = path.join(blobs, `${name}.bin`);
    if (!fs.existsSync(file)) fs.writeFileSync(file, value);
    return { $bytes: name };
  }
  if (value instanceof Map) return { $map: [...value].map(([k, v]) => [k, pack(v, blobs)]) };
  if (value instanceof Set) return { $set: [...value].map((v) => pack(v, blobs)) };
  if (typeof value === 'string' && value.length > BIG) {
    const name = crypto.createHash('sha256').update(value).digest('hex');
    const file = path.join(blobs, name);
    if (!fs.existsSync(file)) fs.writeFileSync(file, value);
    return { $blob: name };
  }
  if (Array.isArray(value)) return value.map((v) => pack(v, blobs));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, pack(v, blobs)]));
  return value;
}

export function unpack(value, blobs) {
  if (Array.isArray(value)) return value.map((v) => unpack(v, blobs));
  if (!value || typeof value !== 'object') return value;
  if (value.$map) return new Map(value.$map.map(([k, v]) => [k, unpack(v, blobs)]));
  if (value.$set) return new Set(value.$set.map((v) => unpack(v, blobs)));
  if (value.$bytes) return fs.readFileSync(path.join(blobs, `${value.$bytes}.bin`));
  if (value.$blob) return fs.readFileSync(path.join(blobs, value.$blob), 'utf8');
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, unpack(v, blobs)]));
}

const nameFrom = (email) => { const s = String(email).split('@')[0]; return s[0].toUpperCase() + s.slice(1); };

export function startStandinCloud({ port = 0, file = null, saveEveryMs = 3000 } = {}) {
  const cloud = createMemoryCloud();
  const blobs = file ? `${file}.blobs` : null;
  if (file) {
    fs.mkdirSync(blobs, { recursive: true });
    try {
      const saved = unpack(JSON.parse(fs.readFileSync(file, 'utf8')), blobs);
      for (const [k, v] of Object.entries(saved)) cloud[k] = v;
    } catch (err) { if (err.code !== 'ENOENT') throw err; }
  }

  let dirty = false;
  const mark = () => { dirty = true; };
  for (const e of ['lines', 'cards', 'people', 'phone', 'rooms', 'work']) cloud.events.on(e, mark);
  cloud.events.setMaxListeners(0);
  const save = () => {
    if (!file || !dirty) return;
    dirty = false;
    const { events: _events, now: _now, ...rest } = cloud;
    const tmp = `${file}.${process.pid}.tmp`;
    // A full disk stops the saving, never the team: the state is still in memory.
    try {
      fs.writeFileSync(tmp, JSON.stringify(pack(rest, blobs)));
      fs.renameSync(tmp, file);
    } catch (err) {
      dirty = true;
      try { fs.rmSync(tmp, { force: true }); } catch { /* the disk is the problem */ }
      console.error(`stand-in cloud: could not save: ${err.message}`);
    }
  };
  const saver = file ? setInterval(save, saveEveryMs) : null;
  saver?.unref?.();

  const boot = crypto.randomUUID();
  // One held change list per person, filled by the same subscriptions a
  // backend gives its app, and emptied by that person's long poll.
  const listeners = new Map();
  function listener(personId) {
    let l = listeners.get(personId);
    if (l) return l;
    l = { events: [], wake: null };
    const hear = (e) => { l.events.push(e); l.wake?.(); };
    const b = memoryBackend(cloud, personId);
    b.subscribe(() => hear({ kind: 'change' }));
    b.subscribeRooms((e) => hear({ kind: 'rooms', event: e }));
    listeners.set(personId, l);
    return l;
  }

  const handlers = {
    async signin({ email, password: _password, name }) {
      const at = String(email ?? '').trim().toLowerCase();
      if (!at.includes('@')) throw new Error('that is not an email');
      let person = [...cloud.people.values()].find((p) => p.email === at);
      if (!person) person = cloud.people.get(signUpMemory(cloud, { email: at, name: name || nameFrom(at) }));
      mark();
      const backend = memoryBackend(cloud, person.id);
      const methods = Object.keys(backend).filter((k) => typeof backend[k] === 'function' && !k.startsWith('subscribe'));
      return { token: person.id, personId: person.id, kind: 'standin', methods, boot };
    },
    async call({ token, method, args = [] }) {
      if (!cloud.people.has(token)) throw new Error('nobody by that token');
      const backend = memoryBackend(cloud, token);
      if (typeof backend[method] !== 'function' || method.startsWith('subscribe')) throw new Error(`no call named ${method}`);
      // Bytes cross as { __bytes: base64 } both ways (main/team/standin-backend.mts).
      const value = await backend[method](...args.map((a) => (a && typeof a === 'object' && typeof a.__bytes === 'string' ? Buffer.from(a.__bytes, 'base64') : a)));
      mark();
      return { value: value === undefined ? null : Buffer.isBuffer(value) ? { __bytes: value.toString('base64') } : value };
    },
    async wait({ token, waitMs = 25_000 }) {
      if (!cloud.people.has(token)) throw new Error('nobody by that token');
      const l = listener(token);
      if (!l.events.length) {
        await new Promise((resolve) => {
          const done = () => { clearTimeout(timer); l.wake = null; resolve(); };
          const timer = setTimeout(done, Math.min(waitMs, 25_000));
          l.wake = done;
        });
      }
      return { boot, events: l.events.splice(0) };
    },
  };

  const server = http.createServer(async (req, res) => {
    const send = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
      const handler = handlers[(req.url || '').replace(/^\/+/, '').split('?')[0]];
      if (!handler) return send(404, { error: 'no such door' });
      return send(200, await handler(body));
    } catch (err) {
      return send(400, { error: String(err?.message || err) });
    }
  });

  // Every open file's live room, on the same door: the copies find it from the cloud's address.
  const live = attachLiveRooms(server);

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        url: `http://127.0.0.1:${server.address().port}`,
        cloud,
        save,
        stop: () => new Promise((done) => {
          if (saver) clearInterval(saver);
          save();
          for (const l of listeners.values()) l.wake?.();
          live.close();
          server.closeAllConnections?.();
          server.close(() => done());
        }),
      });
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : null; };
  const started = await startStandinCloud({ port: Number(arg('port')) || 54900, file: arg('file') });
  console.log(`stand-in team cloud on ${started.url}`);
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => started.stop().then(() => process.exit(0)));
}
