// A BROWSER TAB SURVIVES A RELOAD.
//
// The tab takes the token out of its address bar as soon as it loads
// (renderer/src/browser-bridge.ts) and keeps it in sessionStorage, so a reload
// asks for `/` with no token on it. The Linux pull request (2026-10-07) made
// the server refuse the page itself without the token, so every reload drew
// "Wrong or missing token" instead of the inbox. Measured in a Debian
// container: a bare `/` answered 403 on that branch and 200 on main.
//
// The page is the same built files for everybody and holds nothing of anybody's.
// What the token guards is the store: /api and /events.
import { it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer, newToken } from '../main/serve.mjs';

let server, base, token, dist;

beforeAll(async () => {
  dist = fs.mkdtempSync(path.join(os.tmpdir(), 'tab-reload-'));
  fs.mkdirSync(path.join(dist, 'assets'));
  fs.writeFileSync(path.join(dist, 'index.html'), '<script src="./assets/app.js"></script>');
  fs.writeFileSync(path.join(dist, 'assets', 'app.js'), 'console.log(1)');
  token = newToken();
  const channels = new Map([['zero:snapshot', async () => ({ items: [] })]]);
  server = createServer({ channels, token, dist });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => { server.close(); fs.rmSync(dist, { recursive: true, force: true }); });

it('draws the page on a reload that carries no token', async () => {
  const first = await fetch(`${base}/?token=${token}`);
  expect(first.status).toBe(200);
  const reload = await fetch(`${base}/`);
  expect(reload.status).toBe(200);
  expect(await reload.text()).toContain('app.js');
  const named = await fetch(`${base}/index.html`);
  expect(named.status).toBe(200);
});

it('still keeps the store behind the token on that reload', async () => {
  const bare = await fetch(`${base}/api/zero:snapshot`, { method: 'POST', body: '{}' });
  expect(bare.status).toBe(403);
  const wrong = await fetch(`${base}/api/zero:snapshot`, {
    method: 'POST', body: '{}', headers: { 'x-agentbox-token': 'not-the-token' },
  });
  expect(wrong.status).toBe(403);
  const events = await fetch(`${base}/events`);
  expect(events.status).toBe(403);
  const right = await fetch(`${base}/api/zero:snapshot`, {
    method: 'POST', body: '{}', headers: { 'x-agentbox-token': token, 'content-type': 'application/json' },
  });
  expect(right.status).toBe(200);
});
