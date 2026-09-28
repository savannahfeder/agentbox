// Her REAL inbox, off the real built renderer, without going near her app.
//
// Every other shot harness here runs on fixtures, and fixtures cannot argue
// about this change: the whole question is what happens to HER rows, whose
// threads are 22 deep in places. So this one boots the built renderer with a
// `window.zero` bridge that answers `snapshot` out of her ledgers on disk,
// read-only, with every write method refusing. It serves renderer/dist-x,
// NEVER dist, which her running app reloads, and it never launches Electron.
//
//   node scripts/shot-inbox-real.mjs <outDir> [label]
//
// Build dist-x from whichever commit you want first (npm run build -- --outDir
// dist-x), so before/after is two runs of this script over two builds.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { foldWorkItems } from '../shared/work-items.mjs';
import { guard, sweep } from './lib/chrome-guard.mjs';
import { STORE_ROOT } from './lib/machine-paths.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'renderer', 'dist-x');
const outDir = process.argv[2] ?? path.join(root, 'shots');
const label = process.argv[3] ?? 'inbox';
const ACCOUNTS = `${STORE_ROOT}/accounts`;
const DELIVERED_THROUGH = 1786073270132; // hers, read from the app's leveldb
fs.mkdirSync(outDir, { recursive: true });

/* ------------------------- her store, read-only -------------------------- */
const products = [];
const items = [];
for (const acct of fs.readdirSync(ACCOUNTS)) {
  const dir = path.join(ACCOUNTS, acct);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const slug of fs.readdirSync(dir)) {
    const file = path.join(dir, slug, 'work-items.jsonl');
    if (!fs.existsSync(file)) continue;
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    let name = slug;
    const meta = path.join(dir, slug, 'project.json');
    if (fs.existsSync(meta)) { try { name = JSON.parse(fs.readFileSync(meta, 'utf8')).name ?? slug; } catch { /* keep the slug */ } }
    products.push({ slug, name });
    for (const item of foldWorkItems(lines).values()) items.push({ ...item, product: slug, productName: name });
  }
}

const snapshot = {
  products,
  items,
  approvals: [],
  supervisor: {
    paused: false, pausedProducts: [], running: [], stalled: [], queued: [], scheduled: [],
    productOrder: ['agentbox', 'lantern', 'meadow', 'cascade', 'personal'],
    hiddenProducts: [], personalProducts: [], capacity: 0,
  },
  restartNeeded: null,
  config: { browserHome: '', browserPins: [] },
};

/* ------------------------------ the server -------------------------------- */
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let file = path.join(dist, decodeURIComponent(url.pathname));
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

/* ------------------------------ headless ---------------------------------- */
sweep(); // reap anything an earlier run left behind
const profile = fs.mkdtempSync('/tmp/shot-profile-');
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--force-device-scale-factor=2', '--hide-scrollbars', '--no-first-run',
  '--window-size=1440,980', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
guard(chrome, profile);
const wsUrl = await new Promise((resolve, reject) => {
  let buf = '';
  const timer = setTimeout(() => reject(new Error('chrome never printed a devtools url')), 20_000);
  chrome.stderr.on('data', (d) => { buf += d.toString(); const m = buf.match(/ws:\/\/[^\s]+/); if (m) { clearTimeout(timer); resolve(m[0]); } });
});
const ws = new WebSocket(wsUrl);
await new Promise((r) => { ws.onopen = r; });
let nextId = 1;
const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
  ws.send(JSON.stringify({ id, method, params, sessionId }));
});
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const call = (m, p) => send(m, p, sessionId);
await call('Page.enable');
await call('Runtime.enable');
await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 980, deviceScaleFactor: 2, mobile: false });

// The bridge, installed before the app's code runs. Reads only: anything that
// would write to her store throws, so a mis-click in a headless window can
// never reach the ledgers this is reading.
const refuse = 'async () => { throw new Error("read-only shot bridge"); }';
await call('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    window.__SNAP__ = ${JSON.stringify(snapshot)};
    window.zero = {
      snapshot: async () => window.__SNAP__,
      dashboard: async () => ({ ok: false }),
      repeats: async () => [],
      sessionTrace: async () => ({ sessions: [] }),
      onChanged: () => () => {},
      answer: ${refuse}, compose: ${refuse}, schedule: ${refuse},
      composeRepeat: ${refuse}, setRepeat: ${refuse}, endRepeat: ${refuse},
      createProduct: ${refuse}, pauseSupervisor: ${refuse},
    };
    localStorage.setItem('zero.deliveredThrough', '${DELIVERED_THROUGH}');
    window.addEventListener('error', (e) => { window.__ERR__ = String(e.message) + ' @ ' + (e.filename||''); });
    window.addEventListener('unhandledrejection', (e) => { window.__ERR__ = 'rejection: ' + String(e.reason && e.reason.message || e.reason); });
  `,
});

const goto = (url) => new Promise(async (resolve) => {
  const done = () => { ws.removeEventListener('message', onMsg); resolve(); };
  const onMsg = (e) => { const m = JSON.parse(e.data); if (m.method === 'Page.loadEventFired' && m.sessionId === sessionId) done(); };
  ws.addEventListener('message', onMsg);
  await call('Page.navigate', { url });
  setTimeout(done, 8000);
});
const evaluate = async (expression) => {
  const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(name, theme) {
  await goto(origin);
  await evaluate(`localStorage.setItem('zero.theme', ${JSON.stringify(theme)})`);
  await goto(origin);
  await wait(1200);
  const { data } = await call('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1440, height: 980, scale: 1 } });
  fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
  // What the rows actually SAY, read off the live page, so the picture and the
  // list in the write-up cannot disagree.
  const err = await evaluate(`(() => ({ html: document.body.innerHTML.length, text: document.body.innerText.slice(0,300), err: window.__ERR__ ?? null }))()`);
  console.log('probe', JSON.stringify(err));
  const rows = await evaluate(`(() => [...document.querySelectorAll('.row')].map((r) => ({
    title: r.querySelector('.row-title, .title')?.textContent ?? '',
    summary: r.querySelector('.row-summary, .summary')?.textContent ?? '',
    text: r.innerText.replace(/\\n+/g, ' | ').slice(0, 220),
  })))()`);
  console.log(`${name}: ${rows.length} rows`);
  return rows;
}

const out = { label, light: await shot(`${label}-light`, 'light'), dark: await shot(`${label}-dark`, 'dark') };
fs.writeFileSync(path.join(outDir, `${label}-rows.json`), JSON.stringify(out, null, 2));
ws.close();
chrome.kill();
server.close();
process.exit(0);
