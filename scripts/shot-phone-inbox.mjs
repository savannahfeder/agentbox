// Photograph the web app's inbox on an iPhone-sized screen, on the invented
// team of ./lib/everything-else-world.mjs, so Needs you and Everything else
// are both on the bar.
// Build first: cd renderer && npx vite build --outDir dist-ev
// node scripts/shot-phone-inbox.mjs <out.png>
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { NOW, world } from './lib/everything-else-world.mjs';

const require = createRequire(import.meta.url);
const pw = require('playwright');
const chromium = pw[process.env.ENGINE ?? 'chromium'];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'renderer', process.env.DIST ?? 'dist-ev');
const [out] = process.argv.slice(2);
const W = 402;
const H = 874;

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let file = path.join(dist, decodeURIComponent(url.pathname));
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, timezoneId: 'America/Los_Angeles', colorScheme: 'dark' });
const page = await context.newPage();
await page.clock.setFixedTime(NOW);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message)));
await page.addInitScript(({ snap }) => {
  const door = () => { if (document.documentElement) document.documentElement.dataset.door = 'phone'; };
  door();
  document.addEventListener('readystatechange', door);
  window.__SNAP__ = snap;
  const ok = async () => ({ ok: false });
  window.zero = new Proxy({
    snapshot: async () => window.__SNAP__,
    dashboard: ok, repeats: async () => [], sessionTrace: async () => ({ sessions: [] }), onChanged: () => () => {},
  }, { get: (t, k) => (k in t ? t[k] : (typeof k === 'string' && k.startsWith('on') ? () => () => {} : undefined)) });
  if (!localStorage.getItem('__set')) {
    localStorage.setItem('__set', '1');
    localStorage.setItem('zero.theme', 'dark');
    localStorage.setItem('zero.skin', 'ember-grid');
    localStorage.setItem('zero.deliveredThrough', String(Date.now()));
  }
}, { snap: world });
await page.goto(origin);
await page.evaluate(async () => { await document.fonts.ready; });
await page.waitForTimeout(1800);
const search = await page.evaluate(() => {
  const b = document.querySelector('.th-search');
  if (!b) return 'no search button in the page';
  const r = b.getBoundingClientRect();
  const s = getComputedStyle(b);
  return `search at ${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)} display=${s.display} visibility=${s.visibility}`;
});
console.log(search);
fs.mkdirSync(path.dirname(out), { recursive: true });
await page.screenshot({ path: out });
if (errors.length) console.error('page errors:', errors.slice(0, 5));
console.log('wrote', out);
await browser.close();
server.close();
