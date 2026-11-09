// Two threads in the reading pane, for w-1df18b337a. The first is the shape of
// her screenshot: an answer offering "let it ship, or change the chip first?",
// then a newer checkpoint saying it shipped. Before, the old options stood
// under "Shipped"; after, they are gone. The second is a run that shipped and
// offers the one option "Close this task". Fictional threads only.
//
//   arch -arm64 node scripts/shot-options-after-shipped.mjs <distDir> <outDir>
//
// Build the dist first: npx vite build renderer --outDir <distDir>
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { guard, sweep, startableChrome } from './lib/chrome-guard.mjs';

const dist = path.resolve(process.argv[2]);
const outDir = path.resolve(process.argv[3]);
const NOW = Date.now();
const ago = (min) => NOW - min * 60_000;
const ME = 'p-sam';

const products = [{ slug: 'northwind', name: 'Northwind' }];
const by = (ts, source = 'agent') => ({ ts, source, by: ME });

const SHIP_OFFER = [
  '**Let it ship, or change how an untouched chip behaves first?**',
  '',
  'The priority chip is built and all 41 tests that read it pass. If you never press the chip, the message goes with no level and the other side sorts it, as it does today.',
  '',
  '## Options',
  '1. Let it ship as built: an untouched chip sends nothing (recommended)',
  '2. Always send what the chip reads',
].join('\n');
const SHIPPED_NOTE = 'Shipped to main as e4707e4.';
const SHIPPED_RESULT = [
  '**Shipped. The priority chip is live on main.**',
  '',
  'It went out as e4707e4 and the 41 tests that read it pass. Nothing else is waiting on you here.',
  '',
  '## Options',
  '1. Close this task (recommended)',
].join('\n');

const A = {
  id: 'w-a1', product: 'northwind', productName: 'Northwind', kind: 'directive', labels: ['founder'],
  title: 'Set a priority on a message to a teammate', body: 'Let me set a priority on a message I send a teammate.',
  status: 'open', createdBy: ME, createdAt: ago(300), updatedAt: ago(5),
  result: SHIP_OFFER, note: SHIPPED_NOTE,
  wrote: { title: by(ago(300), 'founder'), body: by(ago(300), 'founder'), result: by(ago(40)), note: by(ago(5)) },
};
const B = {
  id: 'w-b1', product: 'northwind', productName: 'Northwind', kind: 'directive', labels: ['founder'],
  title: 'Ship the priority chip', body: 'Ship the priority chip.',
  status: 'open', createdBy: ME, createdAt: ago(200), updatedAt: ago(3),
  result: SHIPPED_RESULT,
  wrote: { title: by(ago(200), 'founder'), body: by(ago(200), 'founder'), result: by(ago(3)) },
};
const lines = {
  'w-a1': [
    { id: 'w-a1', ts: ago(300), source: 'founder', by: ME, patch: { title: A.title, body: A.body, kind: 'directive', labels: ['founder'], status: 'open' } },
    { id: 'w-a1', ts: ago(40), source: 'agent', by: ME, patch: { result: SHIP_OFFER } },
    { id: 'w-a1', ts: ago(5), source: 'agent', by: ME, patch: { note: SHIPPED_NOTE } },
  ],
  'w-b1': [
    { id: 'w-b1', ts: ago(200), source: 'founder', by: ME, patch: { title: B.title, body: B.body, kind: 'directive', labels: ['founder'], status: 'open' } },
    { id: 'w-b1', ts: ago(3), source: 'agent', by: ME, patch: { result: SHIPPED_RESULT } },
  ],
};
const snapshot = {
  products, items: [B, A], approvals: [],
  supervisor: { paused: false, pausedProducts: [], running: [], stalled: [], queued: [], scheduled: [], productOrder: ['northwind'], hiddenProducts: [], personalProducts: [], capacity: 0 },
  restartNeeded: null,
  config: { browserHome: '', browserPins: [] },
};

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

sweep();
const profile = fs.mkdtempSync('/tmp/shot-profile-');
const W = 1920, H = 1080;
const chrome = spawn(startableChrome(), [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--force-device-scale-factor=2', '--hide-scrollbars', '--no-first-run', `--window-size=${W},${H}`, 'about:blank',
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
await call('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: false });

await call('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    window.__SNAP__ = ${JSON.stringify(snapshot)};
    window.__LINES__ = ${JSON.stringify(lines)};
    window.zero = new Proxy({
      snapshot: async () => window.__SNAP__,
      itemHistory: async ({ id }) => ({ ok: true, lines: window.__LINES__[id] ?? [] }),
      dashboard: async () => ({ ok: false }),
      repeats: async () => [],
      sessionTrace: async () => ({ sessions: [] }),
      onChanged: () => () => {},
    }, { get: (t, k) => (k in t ? t[k] : (typeof k !== 'string' || k === 'then') ? undefined : /^on[A-Z]/.test(k) ? () => () => {} : async (...a) => { (window.__CALLS__ ??= []).push([k, a]); return null; }) });
    localStorage.setItem('zero.firstRun.done', '1');
    localStorage.setItem('zero.theme', 'dark');
    window.addEventListener('error', (e) => { window.__ERR__ = String(e.message); });
  `,
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const evaluate = async (expression) => {
  const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
};
const key = (k) => evaluate(`document.activeElement?.blur?.(); window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true }))`);
const shoot = async (name) => {
  const { data } = await call('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: W, height: H, scale: 1 } });
  fs.writeFileSync(path.join(outDir, name), Buffer.from(data, 'base64'));
};
fs.mkdirSync(outDir, { recursive: true });
await call('Page.navigate', { url: origin });
await wait(2500);

// The list opens on the first row, B. Open the second, A, the screenshot's case.
await key('j'); await wait(300); await key('Enter'); await wait(1500);
console.log('A:', await evaluate(`[document.querySelector('.opt-strip')?.innerText ?? 'no options drawn', window.__ERR__ ?? '']`));
await shoot('1-shipped-checkpoint.png');
await key('Escape'); await wait(500); await key('k'); await wait(300); await key('Enter'); await wait(1500);
console.log('B:', await evaluate(`[document.querySelector('.opt-strip')?.innerText ?? 'no options drawn', window.__ERR__ ?? '']`));
await shoot('2-close-this-task.png');
// Pressing 1 there must close the task, not send "Option 1" as a reply. The
// close is held for a few seconds so Z can take it back, so wait it out.
await evaluate(`window.__CALLS__ = []`);
await key('1'); await wait(8000);
console.log('after 1:', JSON.stringify(await evaluate(`window.__CALLS__.filter(([k]) => k === 'answer')`)));
ws.close();
chrome.kill();
server.close();
process.exit(0);
