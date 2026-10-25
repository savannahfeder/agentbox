// EVERY PICTURE WAS MISSING IN THE BROWSER COPY (`npx agentbox-app`).
//
// Found in the 3-hour cloud test, 2026-10-22. The window asks for a picture on
// the app's own scheme, `agentbox-img://file/…` (renderer/src/picture.ts),
// which only Electron answers. The phone was given the same files over http
// instead, at /f/<file key>/img/… (main/serve.mjs), and that rewrite was
// switched on for the phone door alone — so in a tab on this computer every
// pasted screenshot and every picture a worker named drew as a broken image.
// The server bin/agentbox.mjs builds was handed no files to serve either, so
// even the right address would have 404'd.
//
// What is pinned here is the rule the door serves under, because it is the half
// that can quietly become "any file on the disk": a picture inside a root the
// app owns, and nothing else.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, fileKey, picturesTheAppOwns } from '../main/serve.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN = 'a-token-for-this-run';

let home;
let server;
let origin;

beforeAll(async () => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'tab-pictures-'));
  fs.mkdirSync(path.join(home, 'account', 'shots'), { recursive: true });
  fs.mkdirSync(path.join(home, 'elsewhere'), { recursive: true });
  // A one-pixel png, so what comes back can be compared byte for byte.
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001', 'hex');
  fs.writeFileSync(path.join(home, 'account', 'shots', 'pasted.png'), png);
  fs.writeFileSync(path.join(home, 'account', 'zero.config.json'), '{"secret":"not a picture"}');
  fs.writeFileSync(path.join(home, 'elsewhere', 'someone-elses.png'), png);
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'tab-dist-'));
  fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>agentbox</title>');
  server = createServer({
    channels: new Map(),
    token: TOKEN,
    dist,
    files: picturesTheAppOwns({
      config: { accountRoot: path.join(home, 'account') },
      store: { listProducts: () => [{ slug: 'acme', repoPath: path.join(home, 'repo') }] },
    }),
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => server?.close());

const ask = (file) => fetch(`${origin}/f/${fileKey(TOKEN)}/img${file.split('/').map(encodeURIComponent).join('/')}`);

describe('a picture in a thread, asked for from a tab', () => {
  it('comes back', async () => {
    const res = await ask(`${home}/account/shots/pasted.png`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });
});

describe('what the door refuses', () => {
  it('a file that is not a picture, inside the same root', async () => {
    expect((await ask(`${home}/account/zero.config.json`)).status).toBe(403);
  });

  it('a picture outside every root the app owns', async () => {
    expect((await ask(`${home}/elsewhere/someone-elses.png`)).status).toBe(403);
  });

  it('a climb out of a root', async () => {
    const res = await fetch(`${origin}/f/${fileKey(TOKEN)}/img${home}/account/shots/../../elsewhere/someone-elses.png`);
    expect(res.status).toBe(403);
  });

  it('the wrong key', async () => {
    const res = await fetch(`${origin}/f/not-the-key/img${home}/account/shots/pasted.png`);
    expect(res.status).toBe(403);
  });
});

describe('the two halves that have to agree', () => {
  const bin = fs.readFileSync(path.join(root, 'bin', 'agentbox.mjs'), 'utf8');
  const bridge = fs.readFileSync(path.join(root, 'renderer', 'src', 'browser-bridge.ts'), 'utf8');

  it('the command hands its server the pictures to serve', () => {
    expect(bin).toMatch(/picturesTheAppOwns/);
    expect(bin).toMatch(/files:/);
  });

  it('the tab asks for the file key whichever door it came in by', () => {
    // The fetch used to sit inside `if (phone)`, which is what left the
    // computer's own tab asking for addresses nothing answers.
    const at = bridge.indexOf("fetch('/file-key'");
    expect(at).toBeGreaterThan(-1);
    expect(bridge.slice(0, at)).not.toMatch(/if \(phone\) \{[^}]*$/);
    expect(bridge).toMatch(/installPhoneFiles\(said\.key\)/);
  });
});
