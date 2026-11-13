// "QUITE OFTEN IT JUST SAYS 'AGENTBOX IS NOT ANSWERING' WHEN I'M LOADING ON MY
// PHONE, BEFORE LOADING A FEW SECONDS LATER. ALSO LOAD TIME IS TOO LONG"
// (w-f430aa863d, 2026-10-28).
//
// Measured on main at 396c77f: every open of the phone fetched the screen's
// 2.5 MB of script and style from her computer, never kept, and then the
// inbox, 1.47 MB of json for one of her projects alone. A first read that
// missed waited for the next poll, 30 seconds on a phone. What holds now:
// - the screen's built files are marked as kept for good, and the page is not;
// - a first read that missed is asked again in seconds.
// The relay's half of this went with the relay (2026-11-01).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createHandler, newToken } from '../main/serve.mts';

const SCRIPT = 'function drawTheInbox(){return "rows"}\n'.repeat(20_000);

let server, port, dist;

beforeAll(async () => {
  dist = fs.mkdtempSync(path.join(os.tmpdir(), 'kept-dist-'));
  fs.writeFileSync(path.join(dist, 'index.html'), '<p>the inbox page</p>');
  fs.mkdirSync(path.join(dist, 'assets'));
  fs.writeFileSync(path.join(dist, 'assets', 'main-abc123.js'), SCRIPT);
  const key = newToken();
  server = http.createServer(createHandler({ channels: new Map(), token: () => key, listeners: new Set(), dist }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
});
afterAll(() => { server?.close(); fs.rmSync(dist, { recursive: true, force: true }); });

describe('on the Wi-Fi', () => {
  const get = (p) => fetch(`http://127.0.0.1:${port}${p}`);
  it('the built files are marked as kept for good', async () => {
    expect((await get('/assets/main-abc123.js')).headers.get('cache-control')).toMatch(/immutable/);
  });
  it('and the page, or the page answered for a missing file, is not', async () => {
    expect((await get('/')).headers.get('cache-control') ?? '').not.toMatch(/immutable/);
    expect((await get('/assets/missing.js')).headers.get('cache-control') ?? '').not.toMatch(/immutable/);
  });
});

describe('a first read that missed', () => {
  it('is asked again in seconds, not at the next poll', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toMatch(/const FIRST_READ_AGAIN_MS = 1_500;/);
    expect(app).toMatch(/refresh\(\)\.catch\(\(\) => \{ if \(!gone\) again = setTimeout\(first, FIRST_READ_AGAIN_MS\); \}\)/);
    expect(app).toMatch(/setInterval\(refresh, pollEvery\(10_000, onPhone\(\)\)\)/);
  });
});
