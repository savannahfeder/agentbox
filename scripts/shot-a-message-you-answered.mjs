// The board, signed in to a made-up team, with one message you have answered.
// Before w-57a202a968 that message was on no column at all; after, it is in
// Done today. Fictional people and threads only, never her store.
//
//   arch -arm64 node scripts/shot-a-message-you-answered.mjs <distDir> <out.png>
//
// Build the dist first: npx vite build renderer --outDir <distDir>
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { guard, sweep, startableChrome } from './lib/chrome-guard.mjs';

const dist = path.resolve(process.argv[2]);
const out = path.resolve(process.argv[3]);
const NOW = Date.now();
const ago = (min) => NOW - min * 60_000;

const ME = 'p-sam';
const MAYA = 'p-maya';
const people = [
  { id: ME, email: 'sam@example.com', name: 'Sam Rivera', avatarUrl: null, role: 'owner' },
  { id: MAYA, email: 'maya@example.com', name: 'Maya Chen', avatarUrl: null, role: 'member' },
];
const products = [
  { slug: 'northwind', name: 'Northwind', team: { projectId: 'p-1', teamId: 't-1', sharedBy: ME, visibility: 'team', people: [] } },
  { slug: 'direct-1', name: 'Direct', team: { projectId: 'd-1', teamId: 't-1', sharedBy: MAYA, visibility: 'people', people: [ME], direct: true } },
];
const mine = (by) => ({ ts: ago(300), source: 'founder', by });
const row = (id, title, extra = {}) => ({
  id, product: 'northwind', productName: 'Northwind', title, body: title, kind: 'directive', labels: ['founder'],
  status: 'open', createdBy: ME, createdAt: ago(300), updatedAt: ago(30), visibility: 'team',
  wrote: { title: mine(ME), body: mine(ME) }, ...extra,
});
const items = [
  row('w-a1', 'Pricing page copy', { result: 'Two drafts are ready.', wrote: { title: mine(ME), body: mine(ME), result: { ts: ago(20), source: 'agent', by: ME } } }),
  row('w-a2', 'Onboarding email sequence', { status: 'claimed' }),
  row('w-a3', 'Fix the signup redirect', { status: 'done', updatedAt: ago(90), wrote: { title: mine(ME), body: mine(ME), status: { ts: ago(90), source: 'agent', by: ME } } }),
  {
    id: 'w-m1', product: 'direct-1', productName: 'Direct', kind: 'directive', labels: ['founder'],
    title: 'Hi Sam, sending my findings here', body: 'Hi Sam, sending my findings here: the new project dialog fills in a folder I never typed.',
    answer: 'Working on it 🙏', status: 'open', createdBy: MAYA, assignee: MAYA, people: [MAYA, ME],
    createdAt: ago(600), updatedAt: ago(10),
    wrote: { title: { ts: ago(600), source: 'founder', by: MAYA }, body: { ts: ago(600), source: 'founder', by: MAYA }, answer: { ts: ago(10), source: 'founder', by: ME } },
  },
];
const snapshot = {
  products, items, approvals: [],
  supervisor: { paused: false, pausedProducts: [], running: [], stalled: [], queued: [], scheduled: [], productOrder: ['northwind'], hiddenProducts: [], personalProducts: [], capacity: 0 },
  restartNeeded: null,
  config: { browserHome: '', browserPins: [] },
  team: {
    configured: true, started: true, since: ago(100_000), signedIn: true, me: people[0], team: { id: 't-1', name: 'Northwind' },
    people, cards: [], lastSyncAt: NOW, error: null, sent: [], invites: [],
  },
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
    window.zero = new Proxy({
      snapshot: async () => window.__SNAP__,
      dashboard: async () => ({ ok: false }),
      repeats: async () => [],
      sessionTrace: async () => ({ sessions: [] }),
      onChanged: () => () => {},
    }, { get: (t, k) => (k in t ? t[k] : (typeof k !== 'string' || k === 'then') ? undefined : /^on[A-Z]/.test(k) ? () => () => {} : async () => null) });
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
await call('Page.navigate', { url: origin });
await wait(2500);
// B switches the list to the board, pressed inside the page.
const onBoard = () => evaluate(`!!document.body.innerText.match(/DONE TODAY|Done today/)`);
if (!(await onBoard())) {
  await evaluate(`document.activeElement?.blur?.(); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', code: 'KeyB', bubbles: true }))`);
  await wait(1200);
}
console.log('on board', await onBoard(), 'error', await evaluate('window.__ERR__ ?? null'));
console.log(await evaluate(`document.body.innerText.slice(0, 900)`));
const { data } = await call('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: W, height: H, scale: 1 } });
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.from(data, 'base64'));
ws.close();
chrome.kill();
server.close();
process.exit(0);
