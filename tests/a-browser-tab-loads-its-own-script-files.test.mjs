// A BROWSER TAB CAN LOAD THE SCREEN IT IS GIVEN.
//
// The token rides in the address bar on the first page load only. The page
// then asks for its own script and style files by plain relative paths, which
// carry no token, so a server that wanted the token on every request answered
// the page and refused its scripts: a blank white tab, every time. Found on
// 2026-09-30 photographing two copies of the team version side by side.
//
// The built screen is the same public files for everybody and holds nothing of
// anybody's; the doors that reach the store, /api and /events, are what the
// token guards, and still do.
import { it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer, newToken } from '../main/serve.mjs';

let server, base, token, dist;

beforeAll(async () => {
  dist = fs.mkdtempSync(path.join(os.tmpdir(), 'tab-dist-'));
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

it('serves the page its script files with no token on them', async () => {
  const page = await fetch(`${base}/?token=${token}`);
  expect(page.status).toBe(200);
  const script = await fetch(`${base}/assets/app.js`);
  expect(script.status).toBe(200);
  expect(await script.text()).toBe('console.log(1)');
});

it('still refuses the store without the token', async () => {
  const res = await fetch(`${base}/api/zero:snapshot`, { method: 'POST', body: '{}' });
  expect(res.status).toBe(403);
  const events = await fetch(`${base}/events`);
  expect(events.status).toBe(403);
});
