// A LOCAL CHANNEL CLIENT WRITES NOTHING UNTIL THE SERVER PROVES THE KEY.
//
// What was needed. Windows cannot listen on a unix socket path (EACCES,
// measured on Node 24.11 on Windows 11), so the app's own channels there are
// named pipes, and any local account can create a pipe or connect to ours. A
// pipe server can act as a client once it has read a byte from it. Measured
// with a .NET squatter calling RunAsClient, impersonation failed with "Unable
// to impersonate using a named pipe until data has been read from that pipe"
// while the client had written nothing, and succeeded at Impersonation level
// once the client had written 64 bytes. So in main/local-channel.mts the
// server streams a proof of the account key for each nonce clients left after
// connecting, and a client proves the key back only once it sees its own.
//
// These drive the handshake over a real socket (a unix socket in a temp folder
// on macOS and Linux, a randomly named pipe on Windows) and count the bytes a
// squatter, a replayer or a relay actually received.
import { afterEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { authenticate, leaveChallenge, nonceFeed } from '../main/local-channel.mts';

const MAGIC = Buffer.from('AB3\0', 'latin1');
// The wire format written out independently, so a change to it fails here.
const proof = (key, label, name, ...parts) => {
  const h = crypto.createHmac('sha256', key).update(`AB3|${label}|${Buffer.byteLength(name)}|${name}|`);
  for (const p of parts) h.update(p);
  return h.digest();
};
const frame = (type, body) => Buffer.concat([Buffer.from([type]), body]);

const cleanups = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()();
});

const tempDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-'));
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};

function address() {
  if (process.platform === 'win32') return `\\\\.\\pipe\\lc-test-${crypto.randomBytes(12).toString('hex')}`;
  return path.join(tempDir(), 's.sock');
}

// `first` settles with what onConnection returned for the first connection.
async function serve(onConnection) {
  const at = address();
  const sockets = new Set();
  let settle;
  const first = new Promise((resolve) => { settle = resolve; });
  const server = net.createServer((sock) => {
    sockets.add(sock);
    sock.on('error', () => {});
    sock.on('close', () => sockets.delete(sock));
    settle(Promise.resolve(onConnection(sock)).then((value) => ({ value }), (err) => ({ err })));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(at, resolve); });
  cleanups.push(() => new Promise((resolve) => { for (const s of sockets) s.destroy(); server.close(() => resolve()); }));
  return { at, first };
}

// A connected socket that counts every byte written to it.
function dial(at) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(at);
    cleanups.push(() => sock.destroy());
    sock.written = 0;
    const write = sock.write.bind(sock);
    sock.write = (data, ...rest) => { sock.written += Buffer.byteLength(data); return write(data, ...rest); };
    sock.once('connect', () => { sock.on('error', () => {}); resolve(sock); });
    sock.once('error', reject);
  });
}

// Everything one socket receives, and a promise that settles when it closes.
function record(sock) {
  const got = { bytes: Buffer.alloc(0) };
  sock.on('data', (d) => { got.bytes = Buffer.concat([got.bytes, d]); });
  got.closed = new Promise((resolve) => sock.on('close', resolve));
  return got;
}

const firstLine = (sock) => new Promise((resolve, reject) => {
  let text = '';
  const timer = setTimeout(() => reject(new Error('no line within 5 s')), 5000);
  sock.setEncoding('utf8');
  sock.on('data', (d) => {
    text += d;
    const at = text.indexOf('\n');
    if (at >= 0) { clearTimeout(timer); resolve(text.slice(0, at)); }
  });
});

const NAME = '\\\\.\\pipe\\agentbox-test-0123456789abcdef0123456789abcdef';
const key = crypto.randomBytes(32);
const other = crypto.randomBytes(32);
const challenge = () => ({ nonce: crypto.randomBytes(32) });

// Nonces handed to every handshake, now and whenever `push` adds one.
function feed(...initial) {
  const nonces = [...initial];
  const watchers = new Set();
  return {
    push(...more) { nonces.push(...more); for (const w of watchers) w(more); },
    watch(cb) { watchers.add(cb); setImmediate(() => cb(nonces)); return () => watchers.delete(cb); },
  };
}

// A server without the key that sends `hello` and keeps whatever comes back.
async function squatter(hello) {
  let seen;
  const { at } = await serve((sock) => { seen = record(sock); sock.write(hello()); });
  return { at, seen: () => seen };
}

describe('two ends that hold the same key', () => {
  it('both finish the handshake and then carry application lines both ways', async () => {
    const mine = challenge();
    const { at, first } = await serve((sock) => authenticate(sock, { role: 'server', key, name: NAME, nonces: feed(crypto.randomBytes(32), mine.nonce) }));
    const client = await authenticate(await dial(at), { role: 'client', key, name: NAME, challenge: mine });
    const { value: server } = await first;
    const toServer = firstLine(server);
    const toClient = firstLine(client);
    client.write('from the client\n');
    server.write('from the server\n');
    expect(await toServer).toBe('from the client');
    expect(await toClient).toBe('from the server');
  });

  it('finish when the client leaves its nonce after the server has already started', async () => {
    const mine = challenge();
    const nonces = feed();
    const { at, first } = await serve((sock) => authenticate(sock, { role: 'server', key, name: NAME, nonces }));
    const client = authenticate(await dial(at), { role: 'client', key, name: NAME, challenge: mine });
    await new Promise((r) => setTimeout(r, 100));
    nonces.push(crypto.randomBytes(32));
    nonces.push(mine.nonce);
    await client;
    expect((await first).value).toBeTruthy();
  });

  it('finish through the nonce folder, with the nonce left after connecting', async () => {
    const dir = tempDir();
    const { at, first } = await serve((sock) => authenticate(sock, { role: 'server', key, name: NAME, nonces: nonceFeed(dir).forPipe(NAME) }));
    const sock = await dial(at);
    const mine = leaveChallenge(dir, NAME);
    await authenticate(sock, { role: 'client', key, name: NAME, challenge: mine });
    mine.close();
    expect((await first).value).toBeTruthy();
    expect(fs.readdirSync(path.join(dir, 'challenges'))).toEqual([]);
  });
});

describe('a client', () => {
  it('writes nothing to a server that holds another key', async () => {
    const mine = challenge();
    const { at, first } = await serve((sock) => authenticate(sock, { role: 'server', key: other, name: NAME, nonces: feed(mine.nonce), timeoutMs: 500 }));
    const sock = await dial(at);
    await expect(authenticate(sock, { role: 'client', key, name: NAME, challenge: mine, timeoutMs: 500 })).rejects.toThrow(/no handshake within 500 ms/);
    expect(sock.written).toBe(0);
    expect(sock.destroyed).toBe(true);
    expect((await first).err).toBeTruthy();
  });

  it('writes nothing to a server that does not know its nonce', async () => {
    const { at } = await serve((sock) => authenticate(sock, { role: 'server', key, name: NAME, nonces: feed(crypto.randomBytes(32)), timeoutMs: 500 }));
    const sock = await dial(at);
    await expect(authenticate(sock, { role: 'client', key, name: NAME, challenge: challenge(), timeoutMs: 500 })).rejects.toThrow(/no handshake/);
    expect(sock.written).toBe(0);
  });

  it('with another key refuses a server that holds the right one, and writes nothing', async () => {
    const mine = challenge();
    const { at } = await serve((sock) => authenticate(sock, { role: 'server', key, name: NAME, nonces: feed(mine.nonce), timeoutMs: 500 }));
    const sock = await dial(at);
    await expect(authenticate(sock, { role: 'client', key: other, name: NAME, challenge: mine, timeoutMs: 500 })).rejects.toThrow(/no handshake/);
    expect(sock.written).toBe(0);
  });

  it('writes nothing to a squatter with random proofs, and the squatter sees no byte at all', async () => {
    const fake = await squatter(() => Buffer.concat([MAGIC, crypto.randomBytes(32), frame(1, crypto.randomBytes(32)), frame(0, crypto.randomBytes(32))]));
    const sock = await dial(fake.at);
    const client = authenticate(sock, { role: 'client', key, name: NAME, challenge: challenge() })
      .then((s) => { s.write('SECRET environment line\n'); return s; });
    await expect(client).rejects.toThrow(/did not prove it holds the key, so nothing was sent/);
    await fake.seen().closed;
    expect(fake.seen().bytes.length).toBe(0);
    expect(sock.written).toBe(0);
  });

  it('writes nothing to a squatter that replays a whole handshake the real server streamed to another client', async () => {
    const earlier = challenge();
    const real = await serve((sock) => authenticate(sock, { role: 'server', key, name: NAME, nonces: feed(earlier.nonce), timeoutMs: 1000 }));
    const watched = await dial(real.at);
    let transcript = Buffer.alloc(0);
    watched.on('data', (d) => { transcript = Buffer.concat([transcript, d]); });
    await new Promise((r) => setTimeout(r, 200));
    expect(transcript.length).toBe(36 + 33);

    const fake = await squatter(() => Buffer.concat([transcript, frame(0, crypto.randomBytes(32))]));
    const sock = await dial(fake.at);
    await expect(authenticate(sock, { role: 'client', key, name: NAME, challenge: challenge() })).rejects.toThrow(/did not prove/);
    await fake.seen().closed;
    expect(fake.seen().bytes.length).toBe(0);
  });

  it('writes nothing to a relay at another name, because the proof covers the name', async () => {
    const mine = challenge();
    const real = await serve((sock) => authenticate(sock, { role: 'server', key, name: `${NAME}-real`, nonces: feed(mine.nonce), timeoutMs: 500 }));
    let relayed = 0;
    const relay = await serve(async (inbound) => {
      const outbound = await dial(real.at);
      inbound.on('data', (d) => { relayed += d.length; outbound.write(d); });
      outbound.on('data', (d) => inbound.write(d));
      inbound.on('close', () => outbound.destroy());
      outbound.on('close', () => inbound.destroy());
    });
    const sock = await dial(relay.at);
    await expect(authenticate(sock, { role: 'client', key, name: `${NAME}-relay`, challenge: mine, timeoutMs: 500 })).rejects.toThrow();
    expect(sock.written).toBe(0);
    expect(relayed).toBe(0);
  });

  it('writes nothing to a server that does not speak the handshake', async () => {
    const fake = await squatter(() => Buffer.from('HTTP/1.1 200 OK\r\n\r\n'.padEnd(36, ' ')));
    const sock = await dial(fake.at);
    await expect(authenticate(sock, { role: 'client', key, name: NAME, challenge: challenge() })).rejects.toThrow(/does not speak this handshake/);
    expect(sock.written).toBe(0);
  });

  it('cannot start without the nonce it left', () => {
    expect(() => authenticate(new net.Socket(), { role: 'client', key, name: NAME })).toThrow(/needs the challenge/);
  });
});

describe('a server', () => {
  it('refuses a stranger that sends random bytes for its proof', async () => {
    const { at, first } = await serve((sock) => authenticate(sock, { role: 'server', key, name: NAME, nonces: feed() }));
    (await dial(at)).write(crypto.randomBytes(32));
    expect((await first).err.message).toMatch(/client does not hold the key/);
  });

  it('refuses a stranger that sends back one of the proofs the server streamed', async () => {
    const { at, first } = await serve((sock) => authenticate(sock, { role: 'server', key, name: NAME, nonces: feed(crypto.randomBytes(32)) }));
    const sock = await dial(at);
    let got = Buffer.alloc(0);
    sock.on('data', (d) => {
      got = Buffer.concat([got, d]);
      if (got.length === 36 + 33) sock.write(got.subarray(37, 69));
    });
    expect((await first).err.message).toMatch(/client does not hold the key/);
  });

  it('cannot start without a source of nonces', () => {
    expect(() => authenticate(new net.Socket(), { role: 'server', key, name: NAME })).toThrow(/needs the nonces/);
  });

  it('fails the handshake, and closes the socket, when the nonce folder cannot be read', async () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'challenges'), 'not a folder');
    let server;
    const { at, first } = await serve((sock) => { server = sock; return authenticate(sock, { role: 'server', key, name: NAME, nonces: nonceFeed(dir).forPipe(NAME) }); });
    await dial(at);
    expect((await first).err.message).toMatch(/ENOTDIR|EEXIST|not a directory/i);
    expect(server.destroyed).toBe(true);
  });
});

describe('a peer that stops answering', () => {
  it('ends the client after the timeout and destroys its socket', async () => {
    const { at } = await serve(() => {});
    const sock = await dial(at);
    const started = Date.now();
    const err = await authenticate(sock, { role: 'client', key, name: NAME, challenge: challenge(), timeoutMs: 300 }).catch((e) => e);
    expect(err.message).toMatch(/no handshake within 300 ms/);
    expect(err.reason).toBe('timeout');
    expect(Date.now() - started).toBeLessThan(2000);
    expect(sock.destroyed).toBe(true);
    expect(sock.written).toBe(0);
  });

  it('ends the server after the timeout and destroys its socket', async () => {
    let server;
    const { at, first } = await serve((sock) => { server = sock; return authenticate(sock, { role: 'server', key, name: NAME, nonces: feed(), timeoutMs: 300 }); });
    const closed = record(await dial(at)).closed;
    expect((await first).err.message).toMatch(/no handshake within 300 ms/);
    expect(server.destroyed).toBe(true);
    await closed;
  });

  it('that sends half a proof and then waits is ended too', async () => {
    const { at, first } = await serve((sock) => authenticate(sock, { role: 'server', key, name: NAME, nonces: feed(), timeoutMs: 300 }));
    (await dial(at)).write(crypto.randomBytes(20));
    expect((await first).err.message).toMatch(/no handshake within 300 ms/);
  });
});

describe('bytes that arrive in the same write as the last handshake frame', () => {
  it('reach the client application after the handshake, in order', async () => {
    const mine = challenge();
    const { at } = await serve((sock) => {
      const ns = crypto.randomBytes(32);
      sock.write(Buffer.concat([MAGIC, ns, frame(1, proof(key, 'server', NAME, mine.nonce, ns))]));
      sock.once('data', () => sock.write(Buffer.concat([frame(0, proof(key, 'done', NAME, ns)), Buffer.from('greeting\nsecond\n')])));
    });
    const client = await authenticate(await dial(at), { role: 'client', key, name: NAME, challenge: mine });
    let text = '';
    client.setEncoding('utf8');
    await new Promise((resolve) => client.on('data', (d) => { text += d; if (text.includes('second\n')) resolve(); }));
    expect(text).toBe('greeting\nsecond\n');
  });

  it('reach the server application after the handshake, in order', async () => {
    const { at, first } = await serve((sock) => authenticate(sock, { role: 'server', key, name: NAME, nonces: feed() }));
    const sock = await dial(at);
    let hello = Buffer.alloc(0);
    sock.on('data', (d) => {
      hello = Buffer.concat([hello, d]);
      if (hello.length !== 36) return;
      sock.write(Buffer.concat([proof(key, 'client', NAME, hello.subarray(4, 36)), Buffer.from('first line\n')]));
    });
    const { value: server } = await first;
    expect(await firstLine(server)).toBe('first line');
  });
});
