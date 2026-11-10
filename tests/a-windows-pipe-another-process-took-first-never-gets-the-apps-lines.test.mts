// A WINDOWS PIPE ANOTHER PROCESS TOOK FIRST NEVER GETS THE APP'S LINES.
//
// What was needed, measured on Windows 11 with Node 24.11. listen() on a unix
// socket path fails with EACCES, so the run host, the connections broker, the
// terminal host and the memory gate cannot listen there at all. A named pipe
// can, and a second listen() on a pipe name that is already held fails with
// EADDRINUSE, from the same process or another one. Pipe names are global to
// the machine, so a fixed name could be held by a stranger before the app
// starts, and a name the app used could be taken once its server is gone.
// main/local-channel.mts listens on a random name, records it and its pid in
// the account's own folder, and a client goes only there and writes nothing
// until the server proves the key.
//
// A review measured two more things. A live server whose event loop stalled
// for 3 s lost its marker to a second server, leaving two servers and one of
// them unreachable, so a marker whose server is silent but alive now stays.
// The same happened when the stall had filled libuv's four waiting pipe
// instances, so the second server's connect timed out instead of answering.
// And 100 clients at once against the first design failed 42% of the time,
// so a server now reads the nonce folder once per poll for every handshake.
// These run only on Windows.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { connectLocal, pipeName, serveLocal } from '../main/local-channel.mts';
import { stripTypesFlags } from '../main/strip-types.mts';

const onWindows = it.runIf(process.platform === 'win32');
const TIMEOUT = 500;
const MODULE = pathToFileURL(path.resolve(import.meta.dirname, '../main/local-channel.mts')).href;

const cleanups = [];
afterEach(async () => {
  vi.restoreAllMocks();
  while (cleanups.length) await cleanups.pop()();
});

const tempDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-pipe-'));
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};
const kind = () => `t${crypto.randomBytes(6).toString('hex')}`;
const marker = (dir, k) => path.join(dir, `${k}..pipe`);
const writeMarker = (dir, k, value) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(marker(dir, k), typeof value === 'string' ? value : JSON.stringify(value));
};

function closing(server) {
  const sockets = new Set();
  server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  cleanups.push(() => new Promise((resolve) => {
    for (const s of sockets) s.destroy();
    if (server.listening) server.close(() => resolve()); else resolve();
  }));
  return server;
}

const listen = (server, at) => new Promise((resolve) => {
  server.once('error', (err) => resolve(err.code));
  server.listen(at, () => resolve('listening'));
});

// A process without the key that holds a name and keeps every byte sent to it.
// A silent one sends nothing at all.
async function squatter(name, { silent = false } = {}) {
  const got = { bytes: Buffer.alloc(0), connections: 0 };
  const server = closing(net.createServer((sock) => {
    got.connections += 1;
    sock.on('error', () => {});
    if (!silent) sock.write(Buffer.concat([Buffer.from('AB3\0', 'latin1'), crypto.randomBytes(32), Buffer.from([1]), crypto.randomBytes(32), Buffer.from([0]), crypto.randomBytes(32)]));
    sock.on('data', (d) => { got.bytes = Buffer.concat([got.bytes, d]); });
  }));
  expect(await listen(server, name)).toBe('listening');
  return got;
}

// An application server that counts its connections and keeps the lines it is sent.
function lineServer() {
  const got = { lines: [], connections: 0 };
  const server = closing(net.createServer((sock) => {
    got.connections += 1;
    sock.setEncoding('utf8');
    let buf = '';
    sock.on('data', (d) => {
      buf += d;
      let at;
      while ((at = buf.indexOf('\n')) >= 0) { got.lines.push(buf.slice(0, at)); buf = buf.slice(at + 1); }
    });
  }));
  return { server, got };
}

async function until(check, ms = 5000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 20));
  }
}

async function send(opts, line) {
  const sock = await connectLocal(opts);
  cleanups.push(() => sock.destroy());
  sock.write(`${line}\n`);
  return sock;
}

// A server in a child process this test started, which answers 'stall <ms>'
// on stdin by blocking its event loop. Ended by 'exit', or by this test on a deadline.
async function childServer(dir, k) {
  const script = `
    import net from 'node:net';
    import readline from 'node:readline';
    import { serveLocal } from ${JSON.stringify(MODULE)};
    const server = net.createServer((sock) => sock.end('child\\n'));
    const served = await serveLocal(server, { kind: process.argv[2], dir: process.argv[1], timeoutMs: 500 });
    console.log(JSON.stringify(served));
    readline.createInterface({ input: process.stdin }).on('line', (line) => {
      const [word, ms] = line.split(' ');
      if (word === 'exit') process.exit(0);
      if (word === 'stall') { console.log('stalling'); const end = Date.now() + Number(ms); while (Date.now() < end) {} }
    });`;
  const child = spawn(process.execPath, [...stripTypesFlags(), '--input-type=module', '-e', script, dir, k], { stdio: ['pipe', 'pipe', 'inherit'] });
  const deadline = setTimeout(() => child.kill(), 30_000);
  const exited = new Promise((r) => child.on('exit', r));
  cleanups.push(async () => {
    child.stdin.write('exit\n');
    await Promise.race([exited, new Promise((r) => setTimeout(r, 3000))]);
    if (child.exitCode === null) child.kill();
    clearTimeout(deadline);
  });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  const said = (text) => until(() => out.includes(text), 10_000);
  await said('"state"');
  return { child, served: JSON.parse(out.split('\n')[0]), said };
}

describe('what Windows does with a local socket', () => {
  onWindows('refuses to listen on a unix socket path with EACCES', async () => {
    const server = closing(net.createServer());
    expect(await listen(server, path.join(tempDir(), 'x.sock'))).toBe('EACCES');
  });

  onWindows('refuses a second listen on a pipe name that is already held with EADDRINUSE', async () => {
    const name = `\\\\.\\pipe\\lc-test-${crypto.randomBytes(12).toString('hex')}`;
    expect(await listen(closing(net.createServer()), name)).toBe('listening');
    expect(await listen(closing(net.createServer()), name)).toBe('EADDRINUSE');
  });
});

describe('a server and its client', () => {
  onWindows('meet at the random name in the marker, which goes as soon as close() is called', async () => {
    const dir = tempDir();
    const k = kind();
    const { server, got } = lineServer();
    const served = await serveLocal(server, { kind: k, dir, timeoutMs: TIMEOUT });
    expect(served.state).toBe('serving');
    expect(JSON.parse(fs.readFileSync(marker(dir, k), 'utf8'))).toEqual({ v: 1, name: served.name, pid: process.pid });
    const client = await send({ kind: k, dir, timeoutMs: TIMEOUT }, 'hello');
    await until(() => got.lines.length === 1);
    expect(got.lines).toEqual(['hello']);
    expect(fs.readdirSync(path.join(dir, 'challenges'))).toEqual([]);

    const closed = new Promise((r) => server.close(r));
    expect(fs.existsSync(marker(dir, k))).toBe(false);
    await expect(connectLocal({ kind: k, dir, timeoutMs: TIMEOUT })).rejects.toThrow(/no .* server is running/);
    client.destroy();
    await closed;
  });

  onWindows('close even when the marker cannot be removed, and say why', async () => {
    const dir = tempDir();
    const k = kind();
    const { server } = lineServer();
    const said = [];
    await serveLocal(server, { kind: k, dir, timeoutMs: TIMEOUT, log: (l) => said.push(l) });
    const read = fs.readFileSync;
    // The marker is moved aside before it is checked, and that read is made to fail.
    vi.spyOn(fs, 'readFileSync').mockImplementation((file, ...rest) => {
      if (String(file).startsWith(`${marker(dir, k)}.`)) throw Object.assign(new Error('held by another program'), { code: 'EBUSY' });
      return read(file, ...rest);
    });
    const closed = await Promise.race([
      new Promise((r) => server.close(() => r('closed'))),
      new Promise((r) => setTimeout(() => r('still open'), 3000)),
    ]);
    expect(closed).toBe('closed');
    expect(server.listening).toBe(false);
    expect(said.join('\n')).toMatch(/could not remove the marker \(EBUSY\)/);
  });

  onWindows('keep a stamp apart from the same kind without one', async () => {
    const dir = tempDir();
    const k = kind();
    const a = lineServer();
    const b = lineServer();
    expect((await serveLocal(a.server, { kind: k, dir, timeoutMs: TIMEOUT })).state).toBe('serving');
    expect((await serveLocal(b.server, { kind: k, stamp: 'v2', dir, timeoutMs: TIMEOUT })).state).toBe('serving');
    await send({ kind: k, stamp: 'v2', dir, timeoutMs: TIMEOUT }, 'to b');
    await until(() => b.got.lines.length === 1);
    expect(a.got.lines).toEqual([]);
  });

  onWindows('with no server running is a clear error at once', async () => {
    const started = Date.now();
    await expect(connectLocal({ kind: kind(), dir: tempDir(), timeoutMs: TIMEOUT })).rejects.toThrow(/no .* server is running/);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  onWindows('carry 100 clients that connect at once', async () => {
    const dir = tempDir();
    const k = kind();
    const { server, got } = lineServer();
    await serveLocal(server, { kind: k, dir });
    const results = await Promise.allSettled(Array.from({ length: 100 }, (_, i) => send({ kind: k, dir }, `client ${i}`)));
    expect(results.filter((r) => r.status === 'rejected').map((r) => r.reason.message)).toEqual([]);
    await until(() => got.lines.length === 100);
  }, 30_000);
});

describe('a marker that names no pipe a server of this kind made', () => {
  onWindows('is not followed by a client, and is replaced by the next server', async () => {
    const dir = tempDir();
    const k = kind();
    const elsewhere = `\\\\.\\pipe\\lc-test-${crypto.randomBytes(16).toString('hex')}`;
    const squat = await squatter(elsewhere);
    writeMarker(dir, k, { v: 1, name: elsewhere, pid: process.pid });
    await expect(connectLocal({ kind: k, dir, timeoutMs: TIMEOUT })).rejects.toThrow(/no .* server is running/);
    writeMarker(dir, k, { v: 1, name: pipeName(kind()), pid: process.pid });
    await expect(connectLocal({ kind: k, dir, timeoutMs: TIMEOUT })).rejects.toThrow(/no .* server is running/);
    writeMarker(dir, k, 'not json');
    const { server } = lineServer();
    expect((await serveLocal(server, { kind: k, dir, timeoutMs: TIMEOUT })).state).toBe('serving');
    expect(squat.connections).toBe(0);
  });
});

describe('a marker left by a server that is gone', () => {
  onWindows('sends the client to a squatter that gets no byte, and the next server replaces it', async () => {
    const dir = tempDir();
    const k = kind();
    const stale = pipeName(k);
    writeMarker(dir, k, { v: 1, name: stale, pid: process.pid });
    const squat = await squatter(stale);

    await expect(send({ kind: k, dir, timeoutMs: TIMEOUT }, 'SECRET environment line')).rejects.toThrow(/did not prove it holds the key, so nothing was sent/);

    const { server, got } = lineServer();
    const said = [];
    const served = await serveLocal(server, { kind: k, dir, timeoutMs: TIMEOUT, log: (l) => said.push(l) });
    expect(served.state).toBe('serving');
    expect(served.name).not.toBe(stale);
    expect(said.join('\n')).toMatch(/did not prove the key/);
    await send({ kind: k, dir, timeoutMs: TIMEOUT }, 'SECRET environment line');
    await until(() => got.lines.length === 1);

    expect(squat.connections).toBe(2);
    expect(squat.bytes.length).toBe(0);
  });

  onWindows('is replaced when its pipe is silent and its pid has exited', async () => {
    const dir = tempDir();
    const k = kind();
    const gone = spawn(process.execPath, ['-e', '']);
    await new Promise((r) => gone.on('exit', r));
    const stale = pipeName(k);
    const squat = await squatter(stale, { silent: true });
    writeMarker(dir, k, { v: 1, name: stale, pid: gone.pid });
    const { server } = lineServer();
    expect((await serveLocal(server, { kind: k, dir, timeoutMs: TIMEOUT })).state).toBe('serving');
    expect(squat.bytes.length).toBe(0);
  });
});

describe('a live server that stalls', () => {
  onWindows('keeps its marker, and a second server is told it is busy instead of taking over', async () => {
    const dir = tempDir();
    const k = kind();
    const first = await childServer(dir, k);
    expect(first.served.state).toBe('serving');
    const before = fs.readFileSync(marker(dir, k), 'utf8');
    expect(JSON.parse(before).pid).toBe(first.child.pid);

    first.child.stdin.write('stall 3000\n');
    await first.said('stalling');
    // libuv keeps four pipe instances waiting, so these fill them and the
    // second server's own connect then times out against a live server.
    for (let i = 0; i < 4; i++) {
      const raw = net.connect(first.served.name);
      raw.on('error', () => {});
      cleanups.push(() => raw.destroy());
    }
    await new Promise((r) => setTimeout(r, 200));
    const { server } = lineServer();
    expect(await serveLocal(server, { kind: k, dir, timeoutMs: TIMEOUT })).toEqual({ state: 'busy', name: first.served.name });
    expect(server.listening).toBe(false);
    expect(fs.readFileSync(marker(dir, k), 'utf8')).toBe(before);

    const sock = await connectLocal({ kind: k, dir, timeoutMs: 5000 });
    cleanups.push(() => sock.destroy());
    sock.setEncoding('utf8');
    let text = '';
    await new Promise((resolve) => { sock.on('data', (d) => { text += d; }); sock.on('end', resolve); });
    expect(text).toBe('child\n');
  }, 30_000);
});

describe('a nonce folder that cannot be used', () => {
  onWindows('closes the connection and says why, without an uncaught error, and the client says why too', async () => {
    const dir = tempDir();
    const k = kind();
    const { server, got } = lineServer();
    const said = [];
    const { name } = await serveLocal(server, { kind: k, dir, timeoutMs: TIMEOUT, log: (l) => said.push(l) });
    fs.writeFileSync(path.join(dir, 'challenges'), 'not a folder');

    const raw = net.connect(name);
    raw.on('error', () => {});
    raw.resume();
    cleanups.push(() => raw.destroy());
    await new Promise((resolve) => raw.on('close', resolve));
    expect(said.join('\n')).toMatch(/ENOTDIR|not a directory/i);
    expect(got.connections).toBe(0);

    await expect(connectLocal({ kind: k, dir, timeoutMs: TIMEOUT })).rejects.toThrow(/could not leave a nonce/);
  });
});

describe('a second server of the same kind', () => {
  onWindows('is told the channel is taken, does not listen, and can serve once the first has closed', async () => {
    const dir = tempDir();
    const k = kind();
    const first = lineServer();
    const second = lineServer();
    const one = await serveLocal(first.server, { kind: k, dir, timeoutMs: TIMEOUT });
    expect(await serveLocal(second.server, { kind: k, dir, timeoutMs: TIMEOUT })).toEqual({ state: 'taken', name: one.name });
    expect(second.server.listening).toBe(false);

    await new Promise((r) => first.server.close(r));
    expect((await serveLocal(second.server, { kind: k, dir, timeoutMs: TIMEOUT })).state).toBe('serving');
    await send({ kind: k, dir, timeoutMs: TIMEOUT }, 'to the second');
    await until(() => second.got.lines.length === 1);
  });
});

describe('one server served twice', () => {
  onWindows('hands each connection to the application once after closing and serving again', async () => {
    const dir = tempDir();
    const k = kind();
    const { server, got } = lineServer();
    await serveLocal(server, { kind: k, dir, timeoutMs: TIMEOUT });
    await new Promise((r) => server.close(r));
    await serveLocal(server, { kind: k, dir, timeoutMs: TIMEOUT });
    await send({ kind: k, dir, timeoutMs: TIMEOUT }, 'once');
    await until(() => got.lines.length === 1);
    await new Promise((r) => setTimeout(r, 100));
    expect(got.connections).toBe(1);
    expect(got.lines).toEqual(['once']);
  });

  onWindows('is refused while it is still serving', async () => {
    const dir = tempDir();
    const k = kind();
    const { server } = lineServer();
    await serveLocal(server, { kind: k, dir, timeoutMs: TIMEOUT });
    await expect(serveLocal(server, { kind: kind(), dir, timeoutMs: TIMEOUT })).rejects.toThrow(/already serving a local channel/);
    expect(server.listening).toBe(true);
  });
});

describe('an http server behind the channel', () => {
  onWindows('answers a client that proved the key and never sees one that did not', async () => {
    const dir = tempDir();
    const k = kind();
    let requests = 0;
    const server = closing(http.createServer((req, res) => { requests += 1; res.end('hello'); }));
    const { name } = await serveLocal(server, { kind: k, dir, timeoutMs: TIMEOUT });

    const raw = net.connect(name);
    raw.on('error', () => {});
    cleanups.push(() => raw.destroy());
    let rawGot = Buffer.alloc(0);
    raw.on('data', (d) => { rawGot = Buffer.concat([rawGot, d]); });
    raw.write('GET / HTTP/1.1\r\nHost: x\r\n\r\n');
    await new Promise((resolve) => raw.on('close', resolve));
    expect(rawGot.length).toBe(36);
    expect(requests).toBe(0);

    const sock = await connectLocal({ kind: k, dir, timeoutMs: TIMEOUT });
    const body = await new Promise((resolve, reject) => {
      const req = http.request({ createConnection: () => sock, path: '/', timeout: 5000 }, (res) => {
        let text = '';
        res.on('data', (d) => { text += d; });
        res.on('end', () => resolve(text));
      });
      req.on('timeout', () => req.destroy(new Error('no answer')));
      req.on('error', reject);
      req.end();
    });
    expect(body).toBe('hello');
    expect(requests).toBe(1);
  });
});
