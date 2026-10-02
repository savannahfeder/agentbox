// A read-only headless copy of her real inbox, at a fixed window size, with a
// fresh load before the shutter. Lifted out of scripts/shot-skin.mjs
// because the theme round needed the same boot fifteen times over and copying
// it fifteen times is how the two harnesses drift apart.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { guard, sweep } from './chrome-guard.mjs';
import { foldWorkItems } from '../../shared/work-items.mjs';
import { STORE_ROOT } from './machine-paths.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ACCOUNTS = `${STORE_ROOT}/accounts`;
const DELIVERED_THROUGH = 1786073270132;

export function herSnapshot() {
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
  return {
    products, items, approvals: [],
    supervisor: {
      paused: false, pausedProducts: [], running: [], stalled: [], queued: [], scheduled: [],
      productOrder: ['agentbox', 'lantern', 'meadow', 'cascade', 'personal'],
      hiddenProducts: [], personalProducts: [], capacity: 0,
    },
    restartNeeded: null,
    config: {},
  };
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.json': 'application/json' };

export async function openInbox({ dist, width = 1440, height = 944, snapshot }) {
  const distDir = path.isAbsolute(dist) ? dist : path.join(root, dist);
  const snap = snapshot ?? herSnapshot();
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let file = path.join(distDir, decodeURIComponent(url.pathname));
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(distDir, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;

  sweep();
  const profile = fs.mkdtempSync('/tmp/shot-profile-');
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--force-device-scale-factor=2', '--hide-scrollbars', '--no-first-run',
    `--window-size=${width},${height}`, 'about:blank',
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
  await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: false });

  const refuse = 'async () => { throw new Error("read-only shot bridge"); }';
  await call('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      window.__SNAP__ = ${JSON.stringify(snap)};
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

  // A fresh load with the fonts in, before the shutter. THE APP HAS ONE LOOK,
  // Light (w-9e434e8671), so there is nothing to put on: the argument older
  // scripts still pass (`{ theme, skin }`) is accepted and ignored, and every
  // preview is drawn in the look people actually open.
  async function wear() {
    await goto(origin);
    await evaluate(`(async () => { await document.fonts.ready; await new Promise(r => setTimeout(r, 400)); })()`);
    await wait(1500);
  }

  async function capture(file) {
    const { data } = await call('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width, height, scale: 1 } });
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    return file;
  }

  return {
    origin, call, evaluate, goto, wait, wear, capture, width, height,
    close: () => { try { ws.close(); } catch {} chrome.kill(); server.close(); },
  };
}
