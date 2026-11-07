// Photograph Everything else on an invented team (./lib/everything-else-world.mjs),
// in Ember Grid, as a 16-inch MacBook's full-screen window at the app's zoom.
// Build first: cd renderer && npx vite build --outDir dist-ev
// node scripts/shot-everything-else.mjs <out.png> [look] [--needs] [--open=<section>] [--fold=<sections>]
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { NOW, world } from './lib/everything-else-world.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'renderer', process.env.DIST ?? 'dist-ev');
const [out, look = '', ...flags] = process.argv.slice(2);
const W = Number(process.env.W ?? 1425);
const H = Number(process.env.H ?? 883);
const DPR = Number(process.env.DPR ?? 2.4);

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

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, timezoneId: 'America/Los_Angeles', colorScheme: 'dark' });
const page = await context.newPage();
await page.clock.setFixedTime(NOW);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message)));
const folded = (flags.find((f) => f.startsWith('--fold=')) ?? '--fold=progress,later,done').slice('--fold='.length).split(',').filter(Boolean);
const open = (flags.find((f) => f.startsWith('--open=')) ?? '--open=').slice('--open='.length);
const list = flags.includes('--list');
await page.addInitScript(({ snap, look, folded, open, list }) => {
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
    localStorage.setItem('agentbox.yourThreads.folded', JSON.stringify(folded));
    localStorage.setItem('agentbox.everything.hidden', JSON.stringify({ 'room:r-design': 1 }));
    if (look) localStorage.setItem('agentbox.everything.look', look);
    if (list) localStorage.setItem('agentbox.everything.view', 'list');
    if (open) localStorage.setItem('agentbox.everything.calmOpen', open);
  }
}, { snap: world, look, folded, open, list });
await page.goto(origin);
await page.evaluate(async () => { await document.fonts.ready; });
await page.waitForTimeout(1500);
if (!flags.includes('--needs')) {
  const tab = page.getByRole('button', { name: /everything else/i }).first();
  if (await tab.count()) await tab.click(); else errors.push('no Everything else tab');
  await page.waitForTimeout(900);
}
for (const f of flags.filter((x) => /^--(click|card|css)=/.test(x))) {
  const [flag, what] = [f.slice(2, f.indexOf('=')), f.slice(f.indexOf('=') + 1)];
  const target = flag === 'card' ? page.locator(`.ev-card[data-key="${what}"]`) : flag === 'css' ? page.locator(what) : page.getByText(what, { exact: false });
  await target.first().click();
  await page.waitForTimeout(700);
}
await page.mouse.move(W - 5, H - 5);
await page.waitForTimeout(300);
fs.mkdirSync(path.dirname(out), { recursive: true });
await page.screenshot({ path: out });
if (errors.length) console.error('page errors:', errors.slice(0, 5));
console.log('wrote', out);
await browser.close();
server.close();
