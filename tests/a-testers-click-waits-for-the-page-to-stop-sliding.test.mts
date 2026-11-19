// A TESTER'S CLICK WAITS FOR THE PAGE TO STOP SLIDING.
//
// Test days on 2026-11-16 and 2026-11-18, in the cloud: the ops tester pressed
// "IN PROGRESS 7" right after pressing Inbox in the sidebar, and the Done list
// opened. Leaving the narrow sidebar slides the page back 164px; the picture
// showed Done sitting where In progress had been before the slide. browse.mjs
// re-aimed 320ms after the pointer arrived, but by the number the last look
// gave, and a tab drawn again has no number: it found nothing and pressed the
// old spot. Here the tabs are drawn again as the page slides, as the failing
// run showed "pressed: Done", and the click must land on In progress.
import { it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { canDrive } from '../.claude/skills/verify-agentbox/scripts/cdp.mjs';

const BROWSE = path.resolve('.claude/skills/verify-agentbox/scripts/browse.mjs');
const KEY = crypto.createHash('sha1').update(path.resolve('.')).digest('hex').slice(0, 8);

const PAGE = `<!doctype html><style>
  body { margin: 0; font: 14px sans-serif; }
  nav { position: fixed; left: 0; top: 0; bottom: 0; width: 60px; background: #222; z-index: 1; }
  nav.open { width: 224px; }
  main { padding-left: 60px; transition: padding-left .2s linear; }
  main.open { padding-left: 224px; }
  .tabs { padding-top: 40px; display: flex; }
  .tabs button { width: 80px; height: 30px; flex: none; }
</style>
<nav id="nav"><button>Inbox</button></nav>
<main id="main"><div class="tabs"><button>Needs you</button><button>In progress</button><button>Later</button><button>Done</button></div><p id="said">pressed: nothing</p></main>
<script>
  nav.addEventListener('mouseenter', () => { nav.classList.add('open'); main.classList.add('open'); });
  // Drawn afresh, as React does when the top bar the tabs sit in is drawn again.
  const drawTabs = () => {
    const tabs = document.querySelector('.tabs');
    tabs.innerHTML = '<button>Needs you</button><button>In progress</button><button>Later</button><button>Done</button>';
    tabs.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { said.textContent = 'pressed: ' + b.textContent; }));
  };
  drawTabs();
  nav.addEventListener('mouseleave', () => { nav.classList.remove('open'); main.classList.remove('open'); drawTabs(); });
</script>`;

it.skipIf(!canDrive())('a click after the sidebar presses the tab named, not the one the page slid under the pointer', async () => {
  const server = http.createServer((_q, s) => { s.writeHead(200, { 'content-type': 'text/html' }); s.end(PAGE); });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as { port: number }).port;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'slide-'));
  const name = `slide-${process.pid}`;
  const instance = path.join(root, 'instances', `${KEY}-${name}`);
  fs.mkdirSync(instance, { recursive: true });
  fs.writeFileSync(path.join(instance, 'instance.json'), JSON.stringify({ url: `http://127.0.0.1:${port}/` }));
  const env = { ...process.env, NODE_OPTIONS: '', VERIFY_ROOT: root, VERIFY_INSTANCE: name, BREAKER_OUT: root };
  // Not spawnSync: that would hold this process, and with it the page's server.
  const app = (...args: string[]) => new Promise<string>((resolve) => {
    const p = spawn(process.execPath, [BROWSE, ...args], { env });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('exit', () => resolve(out));
  });
  try {
    await app('open');
    expect(await app('click', 'Inbox')).toMatch(/Pressed "Inbox"/);
    await new Promise((r) => setTimeout(r, 500));
    const n = /(\d+)\. button "In progress"/.exec(await app('look'))?.[1];
    expect(n).toBeTruthy();
    expect(await app('click', n!)).toMatch(/Pressed "In progress"/);
    expect(await app('look')).toMatch(/pressed: In progress\n/);
  } finally {
    spawnSync(process.execPath, [BROWSE, 'close'], { env, timeout: 30_000 });
    server.close();
  }
}, 90_000);
