// PICTURES AND DESIGN PAGES WERE BLANK ON A PHONE (2026-10-11). The desktop
// draws them from two addresses only its own window can open (agentbox-img://
// and agentbox-doc://, main/img-scheme.mts and main/doc-scheme.mts); a phone
// asked for them and got nothing, so every screenshot in a message and every
// design page an agent made came up empty on a real iPhone ("images and
// artefacts are missing"). Measured by reading main/serve.mts: it answered
// /events, /api/* and the built screen, and nothing else.
//
// The phone's own server now answers /f/<file key>/<doc|img>/<path> under the
// same two rules the desktop's schemes use. The file key is not the phone's
// key: a design page runs its own scripts and can read its own address, and
// the phone's key would let it start agents and approve their requests. The
// file key reads files the desktop would show and does nothing else.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer, newToken, fileKey } from '../main/serve.mts';
import { phoneFileUrl } from '../renderer/src/phone-files';

let server, base, token, root, outside, dist;
const allowedRoot = () => root;

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-files-'));
  outside = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-outside-'));
  dist = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-dist-'));
  fs.writeFileSync(path.join(dist, 'index.html'), '<p>app</p>');
  fs.mkdirSync(path.join(root, 'designs', 'a b'), { recursive: true });
  fs.writeFileSync(path.join(root, 'designs', 'a b', 'shot.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]));
  fs.writeFileSync(path.join(root, 'designs', 'a b', 'page.html'), '<img src="shot.png">');
  fs.writeFileSync(path.join(root, 'designs', 'a b', 'clip.mp4'), Buffer.alloc(100, 7));
  fs.writeFileSync(path.join(outside, 'secret.png'), Buffer.from([1, 2, 3]));
  token = newToken();
  const inside = (f) => f === allowedRoot() || f.startsWith(allowedRoot() + path.sep);
  const files = { allows: (kind, file) => (kind === 'doc' || kind === 'img') && inside(file) };
  server = createServer({ channels: new Map([['zero:snapshot', async () => ({ items: [] })]]), token: () => token, dist, files });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => {
  server.close();
  for (const d of [root, outside, dist]) fs.rmSync(d, { recursive: true, force: true });
});

const at = (key, kind, file) => `${base}/f/${key}/${kind}/${file.split('/').filter(Boolean).map(encodeURIComponent).join('/')}`;

describe('the phone\'s server hands out a file', () => {
  it('answers a picture inside an allowed folder, never from memory', async () => {
    const res = await fetch(at(fileKey(token), 'img', path.join(root, 'designs', 'a b', 'shot.png')));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toMatch(/no-store/);
    expect(Buffer.from(await res.arrayBuffer())[1]).toBe(0x50);
  });

  it('answers a design page, and the picture beside it at the address the page asks for', async () => {
    const page = at(fileKey(token), 'doc', path.join(root, 'designs', 'a b', 'page.html'));
    const res = await fetch(page);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    // The page says src="shot.png"; the browser resolves it against the page.
    const beside = await fetch(new URL('shot.png', page));
    expect(beside.status).toBe(200);
  });

  it('answers a film in the piece the player asks for', async () => {
    const res = await fetch(at(fileKey(token), 'img', path.join(root, 'designs', 'a b', 'clip.mp4')), { headers: { range: 'bytes=10-19' } });
    expect(res.status).toBe(206);
    expect((await res.arrayBuffer()).byteLength).toBe(10);
  });

  it('gives the file key to a caller holding the phone\'s key, and to nobody else', async () => {
    expect((await fetch(`${base}/file-key`)).status).toBe(403);
    const res = await fetch(`${base}/file-key`, { headers: { 'x-agentbox-token': token } });
    expect(res.status).toBe(200);
    expect((await res.json()).key).toBe(fileKey(token));
  });
});

describe('the phone\'s server refuses', () => {
  it('a file outside every allowed folder', async () => {
    expect((await fetch(at(fileKey(token), 'img', path.join(outside, 'secret.png')))).status).toBe(403);
  });

  it('a path that climbs out of an allowed folder', async () => {
    const climb = `${base}/f/${fileKey(token)}/img/${root.split('/').filter(Boolean).map(encodeURIComponent).join('/')}/..%2F${encodeURIComponent(path.basename(outside))}/secret.png`;
    expect((await fetch(climb)).status).toBe(403);
  });

  it('a wrong key, and the phone\'s own key, which never belongs in a file\'s address', async () => {
    const file = path.join(root, 'designs', 'a b', 'shot.png');
    expect((await fetch(at('nope', 'img', file))).status).toBe(403);
    expect((await fetch(at(token, 'img', file))).status).toBe(403);
  });

  it('the file key anywhere but a file', async () => {
    const key = fileKey(token);
    expect((await fetch(`${base}/api/zero:snapshot`, { method: 'POST', body: '{}', headers: { 'x-agentbox-token': key } })).status).toBe(403);
    expect((await fetch(`${base}/api/zero:snapshot?token=${key}`, { method: 'POST', body: '{}' })).status).toBe(403);
    expect((await fetch(`${base}/events?token=${key}`)).status).toBe(403);
  });

  it('a file key from before the phone\'s key was reset', async () => {
    const was = fileKey(token);
    token = newToken();
    expect((await fetch(at(was, 'img', path.join(root, 'designs', 'a b', 'shot.png')))).status).toBe(403);
    expect((await fetch(at(fileKey(token), 'img', path.join(root, 'designs', 'a b', 'shot.png')))).status).toBe(200);
  });

  it('a kind of file it does not hand out', async () => {
    expect((await fetch(at(fileKey(token), 'zip', path.join(root, 'designs', 'a b', 'shot.png')))).status).toBe(404);
  });
});

describe('a server with no files to hand out (a browser tab on this computer)', () => {
  it('answers no file at all', async () => {
    const bare = createServer({ channels: new Map(), token, dist });
    await new Promise((r) => bare.listen(0, '127.0.0.1', r));
    const res = await fetch(`http://127.0.0.1:${bare.address().port}/f/${fileKey(token)}/img${path.join(root, 'designs', 'a b', 'shot.png')}`);
    bare.close();
    expect(res.status).toBe(404);
  });
});

describe('a design page on a phone', () => {
  it('runs in a frame of its own origin, never the app\'s, where the phone\'s key is kept', () => {
    const pane = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'renderer/src/components/DocPane.tsx'), 'utf8');
    expect(pane).toMatch(/onPhone\(\) \? 'allow-scripts' : 'allow-scripts allow-same-origin'/);
  });
});

describe('the phone points the desktop\'s addresses at its server', () => {
  const key = 'k3y';
  it('a picture and a page, on every spelling the app has used', () => {
    expect(phoneFileUrl('agentbox-img://file/Users/x/a%20b/shot.png', key)).toBe('/f/k3y/img/Users/x/a%20b/shot.png');
    expect(phoneFileUrl('agentbox-doc://file/Users/x/page.html', key)).toBe('/f/k3y/doc/Users/x/page.html');
    expect(phoneFileUrl('astral-img://file/Users/x/old.png', key)).toBe('/f/k3y/img/Users/x/old.png');
  });

  it('leaves every other address alone', () => {
    for (const url of ['https://example.com/a.png', '/assets/app.js', 'data:image/png;base64,AA', 'agentbox-img:/nofile', '', 'blob:x']) {
      expect(phoneFileUrl(url, key)).toBe(url);
    }
  });
});
