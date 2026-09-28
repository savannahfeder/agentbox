// THE SECOND FRONT DOOR HAS TO KEEP WORKING WITHOUT ELECTRON.
//
// Agentbox is being open sourced, and the route we point people at is a browser
// tab rather than a downloaded app. That only works because the half of the app
// that starts agents and reads the store never actually needed Electron: it
// needed three things Electron happened to be holding, and `registerIpc` now
// takes those three as an argument.
//
// The failure this guards is quiet and it is one line. Somebody adds a channel
// that wants a menu, or a tray icon, or a BrowserWindow, types
// `import { Menu } from 'electron'` at the top of main/ipc.mjs, and every test
// here still passes, because in plain Node that import resolves to a path
// string instead of throwing. The desktop app keeps working. The browser route
// breaks the next time anybody runs it, and nothing says so.
//
// So this file does both halves: it asserts structurally that ipc.mjs takes its
// Electron through the door rather than importing it, and it then boots the
// whole doing half in this process, with no Electron loaded, and drives it over
// http the way a tab would.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

import { bootHeadless, createServer, newToken, nodeHost, broadcastingWindow } from '../main/serve.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, '..');

describe('main/ipc.mjs', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'main', 'ipc.mjs'), 'utf8');

  it('does not import electron', () => {
    // Both spellings, because `require('electron')` would do the same damage.
    expect(source).not.toMatch(/from\s+['"]electron['"]/);
    expect(source).not.toMatch(/require\(\s*['"]electron['"]\s*\)/);
  });

  it('says so plainly when a caller forgets the host', async () => {
    const { registerIpc } = await import('../main/ipc.mjs');
    expect(() => registerIpc({ store: {}, supervisor: {}, config: {}, window: {} }))
      .toThrow(/host/);
  });
});

describe('the doing half, booted with no Electron', () => {
  let dir, booted, server, token, base;

  beforeAll(async () => {
    // A throwaway store in a temp dir. The config file is what points the store
    // somewhere that is not anybody's real one, and it has to be written before
    // the boot reads it.
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-headless-'));
    fs.writeFileSync(
      path.join(dir, 'zero.config.json'),
      JSON.stringify({ storeRoot: path.join(dir, 'store') }),
    );
    booted = await bootHeadless({ dataDir: dir, appDir: repoRoot, userDir: dir });
    token = newToken();
    server = createServer({
      channels: booted.channels,
      token,
      listeners: booted.window.listeners,
      dist: path.join(dir, 'no-screen-here'),
    });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    base = `http://127.0.0.1:${server.address().port}`;
  }, 30_000);

  afterAll(async () => {
    if (server) await new Promise((done) => server.close(done));
    await booted?.supervisor?.stopAll?.().catch?.(() => {});
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('registers every channel the desktop app registers', () => {
    // The number is deliberately a floor rather than an equality: channels get
    // added, and a test that has to be edited every time one is added gets
    // edited without being read. What matters is that the whole surface came up,
    // not that it is exactly this wide.
    expect(booted.channels.size).toBeGreaterThan(70);
    for (const channel of ['zero:snapshot', 'zero:approve', 'zero:terminal', 'zero:track']) {
      expect(booted.channels.has(channel)).toBe(true);
    }
  });

  it('answers a real snapshot over http', async () => {
    const res = await post(`${base}/api/zero:snapshot`, token);
    expect(res.status).toBe(200);
    // The shape the screen reads on its first paint. If this comes back, the
    // store, the supervisor and the config all booted for real.
    for (const key of ['products', 'items', 'agents', 'approvals', 'supervisor']) {
      expect(res.body).toHaveProperty(key);
    }
  });

  it('refuses a request with no token', async () => {
    const res = await post(`${base}/api/zero:snapshot`, null);
    expect(res.status).toBe(403);
  });

  it('says which channel it could not find', async () => {
    const res = await post(`${base}/api/zero:not-a-channel`, token);
    expect(res.status).toBe(404);
    expect(res.body.error).toContain('zero:not-a-channel');
  });

  it('carries a push out to an open event stream', async () => {
    const line = await new Promise((resolve, reject) => {
      const req = http.request(`${base}/events`, { headers: { 'x-agentbox-token': token } }, (res) => {
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toContain('text/event-stream');
        let seen = '';
        res.on('data', (chunk) => {
          seen += chunk;
          const found = seen.split('\n').find((l) => l.startsWith('data: '));
          if (found) { req.destroy(); resolve(found.slice('data: '.length)); }
        });
      });
      req.on('error', (err) => { if (err.code !== 'ECONNRESET') reject(err); });
      req.end();
      // The stream has to be open before the push, the same as a real tab.
      setTimeout(() => booted.window.webContents.send('zero:changed', { what: 'items' }), 100);
    });
    expect(JSON.parse(line)).toEqual({ channel: 'zero:changed', args: [{ what: 'items' }] });
  }, 10_000);
});

describe('the stand-ins for the three Electron things', () => {
  it('says there is no dialog, which is not the same as no picker', async () => {
    const { dialog } = nodeHost();
    const answer = await dialog.showOpenDialog();
    expect(answer.canceled).toBe(true);
    expect(answer.filePaths).toEqual([]);
    // THIS USED TO ANSWER "choosing a folder needs the desktop app", AND THAT
    // WAS WRONG. A browser cannot be handed a path by the operating system, but
    // nothing here needs it to be: this process reads the disk, and the screen
    // draws its own picker on `zero:list-folders`. `noDialog` says only that
    // there is no Mac dialog behind this. See main/folders.mjs.
    expect(answer.noDialog).toBe(true);
    expect(answer.refused).toBeUndefined();
  });

  it('runs the before-quit hooks when the app is asked to quit', () => {
    let ran = 0;
    const { app } = nodeHost();
    app.on('before-quit', () => { ran += 1; });
    app.quit();
    expect(ran).toBe(1);
  });

  it('does not let one closed tab stop a push reaching the others', () => {
    const window = broadcastingWindow();
    const got = [];
    window.listeners.add(() => { throw new Error('this tab has gone'); });
    window.listeners.add((message) => got.push(message));
    window.webContents.send('zero:recovered', 1);
    expect(got).toEqual([{ channel: 'zero:recovered', args: [1] }]);
  });
});

function post(url, token) {
  return new Promise((resolve, reject) => {
    const headers = { 'content-type': 'application/json' };
    if (token) headers['x-agentbox-token'] = token;
    const req = http.request(url, { method: 'POST', headers }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        let parsed = body;
        try { parsed = JSON.parse(body); } catch { /* 403 answers in plain text */ }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    req.end('{}');
  });
}
