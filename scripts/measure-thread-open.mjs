// WHAT OPENING AN AGENT ROW ACTUALLY COSTS, AND WHERE IT LANDS —.
//
// Her report: the pane is blank for a moment with no loading state, and when it
// does arrive it is not at the bottom. Both halves are measured here against
// the REAL reader over her REAL sessions: main/agents.mjs is timed on this
// machine, and the browser's fake IPC waits exactly that long before answering,
// so the blank window on the clock is the blank window she sees.
//
//   node scripts/measure-thread-open.mjs <outDir>
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { foldWorkItems } from '../shared/work-items.mjs';
import * as reader from '../main/agents.mjs';
import { AgentSchedule } from '../main/agent-schedule.mjs';
import { agentKey } from '../shared/agents.mjs';
import { guard, sweep } from './lib/chrome-guard.mjs';
import { HOME, STORE_ROOT } from './lib/machine-paths.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = process.argv[2] ?? path.join(root, 'shots-thread-open');
const ACCOUNTS = `${STORE_ROOT}/accounts`;
const CLAUDE = `${HOME}/.local/bin/claude`;
const schedule = new AgentSchedule(`${STORE_ROOT}`);
fs.mkdirSync(outDir, { recursive: true });

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
    let name = slug; let repoPath = null;
    const meta = path.join(dir, slug, 'project.json');
    if (fs.existsSync(meta)) {
      try { const j = JSON.parse(fs.readFileSync(meta, 'utf8')); name = j.name ?? slug; repoPath = j.repoPath ?? null; } catch { /* slug */ }
    }
    products.push({ slug, name, dir: path.join(dir, slug), oneLiner: '', repoPath });
    for (const item of foldWorkItems(lines).values()) {
      if (item.status === 'done') continue;
      items.push({ ...item, product: slug, productName: name });
    }
  }
}

const zeroPids = new Set(execFileSync('/bin/ps', ['-Ao', 'pid=,command='], { encoding: 'utf8', maxBuffer: 8 << 20 })
  .split('\n').filter((l) => l.includes('/Desktop/dev/zero/node_modules/electron'))
  .map((l) => Number(l.trim().split(/\s+/)[0])).filter(Boolean));

await reader.refresh({ zeroPid: 0, sessionIds: [], products, claudeBin: CLAUDE });
await new Promise((r) => setTimeout(r, 1500));
const agents = reader.listAgents().map((a) => ({ ...a, startedByZero: zeroPids.has(a.ppid) }));
const outside = agents.filter((a) => !a.startedByZero);
console.log(`${agents.length} live sessions, ${outside.length} outside`);

// THE READ, TIMED THREE TIMES EACH. One reading is a coin toss against the page
// cache; the median of three is what the pane pays on an ordinary open.
const conversations = {};
const costs = [];
for (const a of outside) {
  const ms = [];
  let conv = null;
  for (let i = 0; i < 3; i += 1) {
    const t = process.hrtime.bigint();
    conv = await reader.conversation({ pid: a.pid, sessionId: a.sessionId, cwd: a.cwd, spoke: schedule.spoke(agentKey(a)) });
    ms.push(Number(process.hrtime.bigint() - t) / 1e6);
  }
  conversations[a.pid] = conv;
  const median = ms.sort((x, y) => x - y)[1];
  costs.push({ name: a.name, pid: a.pid, ms: +median.toFixed(1), all: ms.map((m) => +m.toFixed(1)), ok: !!conv.ok, total: conv.total ?? 0, turns: conv.turns?.length ?? 0 });
  console.log(`  ${a.name}: ${conv.ok ? `${conv.total} messages, ${conv.turns.length} on screen` : conv.reason} — read ${median.toFixed(0)}ms (${ms.map((m) => m.toFixed(0)).join('/')})`);
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json' };
function serve(dist) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let file = path.join(dist, decodeURIComponent(url.pathname));
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, origin: `http://127.0.0.1:${server.address().port}` })));
}

console.log('building the renderer');
execFileSync('npx', ['vite', 'build', 'renderer', '--outDir', 'dist-thread-open', '--emptyOutDir'], { cwd: root, stdio: 'inherit', env: process.env });
const dist = path.join(root, 'renderer', 'dist-thread-open');

sweep();
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
const send = (method, params = {}, sid) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
  ws.send(JSON.stringify({ id, method, params, sessionId: sid }));
});
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const call = (m, p) => send(m, p, sessionId);
await call('Page.enable');
await call('Runtime.enable');
await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 980, deviceScaleFactor: 2, mobile: false });

const refuse = 'async () => { throw new Error("read-only measure bridge"); }';
const delays = Object.fromEntries(costs.map((c) => [c.pid, c.ms]));
const bridge = () => `
  window.__DELAYS__ = ${JSON.stringify(delays)};
  window.zero = {
    snapshot: async () => ({
      products: ${JSON.stringify(products)},
      items: ${JSON.stringify(items)},
      agents: ${JSON.stringify(agents)},
      approvals: [],
      supervisor: { paused: false, pausedProducts: [], running: [], stalled: [], queued: [], scheduled: [],
        productOrder: ['agentbox', 'lantern', 'meadow', 'cascade', 'personal'],
        hiddenProducts: [], personalProducts: [], capacity: 0 },
      restartNeeded: null,
      config: { browserHome: '', browserPins: [], outsideAgents: 'all' },
    }),
    dashboard: async () => ({ ok: false }),
    artifacts: async () => ({ artifacts: [], memories: [] }),
    repeats: async () => [],
    settings: async () => ({ ok: false, workspace: null, projects: [] }),
    sessionTrace: async () => ({ sessions: [] }),
    onChanged: () => () => {},
    badge: () => {}, notify: () => {},
    answer: ${refuse}, compose: ${refuse}, schedule: ${refuse},
    agentReply: ${refuse}, closeAgent: ${refuse}, scheduleAgent: ${refuse},
    // The real read cost, replayed. This is the only thing in the page that is
    // not the app: the transcript itself and how long it took are both real.
    agentConversation: async ({ pid }) => {
      await new Promise((r) => setTimeout(r, window.__DELAYS__[pid] ?? 0));
      return (${JSON.stringify(conversations)})[pid] ?? { ok: false, reason: 'no transcript' };
    },
    createProduct: ${refuse}, pauseSupervisor: ${refuse},
  };
  window.addEventListener('error', (e) => { window.__ERR__ = String(e.message); });
`;

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

// EVERY FRAME FROM THE CLICK. What is on the screen, where the page is scrolled
// and how far it is from the bottom, sampled on the browser's own paint clock.
const clickAndWatch = (needle, forMs) => evaluate(`(async () => {
  const row = [...document.querySelectorAll('.row')].find((r) => r.innerText.includes(${JSON.stringify(needle)}));
  if (!row) return { ok: false, why: 'no row' };
  const samples = [];
  const t0 = performance.now();
  const tick = () => {
    const pane = document.querySelector('.focus-scroll');
    const body = document.querySelector('.focus-body');
    const wait = document.querySelector('.thread-wait');
    const msgs = document.querySelectorAll('.msg').length;
    samples.push({
      t: +(performance.now() - t0).toFixed(1),
      msgs,
      waitText: wait ? wait.innerText.trim() : null,
      // The waiting page: how tall the shape it draws is, against the pane.
      skel: (() => {
        const sk = document.querySelector('.thread-waiting');
        if (!sk) return null;
        const bars = sk.querySelectorAll('.sk-line, .sk-name, .sk-did').length;
        return { h: Math.round(sk.getBoundingClientRect().height), bars };
      })(),
      // Ink on the screen: how many characters of the message area are drawn.
      chars: body ? body.innerText.replace(/\\s+/g, ' ').trim().length : 0,
      top: pane ? Math.round(pane.scrollTop) : null,
      h: pane ? Math.round(pane.scrollHeight) : null,
      view: pane ? Math.round(pane.clientHeight) : null,
    });
    if (performance.now() - t0 < ${forMs}) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  row.click();
  await new Promise((r) => setTimeout(r, ${forMs + 120}));
  return { ok: true, samples };
})()`);

// WHERE IT CAME TO REST, and what is under the fold when it did.
const atRest = () => evaluate(`(() => {
  const pane = document.querySelector('.focus-scroll');
  if (!pane) return null;
  const gap = Math.round(pane.scrollHeight - pane.scrollTop - pane.clientHeight);
  const paneBottom = pane.getBoundingClientRect().bottom;
  const below = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('.msg, .did, .thread-gap, .focus-actions, .attached, .focus-actions button')) {
    const r = el.getBoundingClientRect();
    if (r.bottom > paneBottom + 1 && !seen.has(el)) {
      seen.add(el);
      below.push({ cls: el.className, hidden: +(r.bottom - paneBottom).toFixed(1), text: el.innerText.replace(/\\s+/g, ' ').slice(0, 90) });
    }
  }
  const last = document.querySelector('.thread > div:last-of-type');
  return {
    scrollTop: Math.round(pane.scrollTop),
    scrollHeight: Math.round(pane.scrollHeight),
    clientHeight: Math.round(pane.clientHeight),
    gapToBottom: gap,
    below: below.slice(0, 8),
    belowCount: below.length,
  };
})()`);

async function shoot(name) {
  const { data } = await call('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1440, height: 980, scale: 1 } });
  fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
  console.log(`  ${name}.png`);
}

const notes = { measuredAt: new Date().toISOString(), costs, runs: [] };
const { server, origin } = await serve(dist);

async function load(theme, skin) {
  await call('Page.addScriptToEvaluateOnNewDocument', { source: bridge() });
  await goto('about:blank');
  await goto(origin);
  await evaluate(`localStorage.setItem('zero.theme', ${JSON.stringify(theme)}); localStorage.setItem('zero.skin', ${JSON.stringify(skin)}); localStorage.setItem('zero.panel', '1')`);
  await goto(origin);
  await wait(2000);
}

const targets = outside.filter((a) => conversations[a.pid]?.ok);
// The session in her screenshot, photographed first.
const HER_SHOT = targets.find((a) => a.name === "session-6f") ?? HER_SHOT;
for (const a of targets) {
  await load('dark', 'lake');
  const watched = await clickAndWatch(a.name, 2500);
  if (!watched?.ok) { console.log(`  ${a.name}: ${watched?.why}`); continue; }
  const rest = await atRest();
  const s = watched.samples;
  const firstInk = s.find((x) => x.msgs > 0);
  const firstWait = s.find((x) => x.waitText);
  const settled = s[s.length - 1];
  notes.runs.push({ agent: a.name, pid: a.pid, read: delays[a.pid], firstInk: firstInk?.t ?? null, firstWait: firstWait?.t ?? null, waitText: firstWait?.waitText ?? null, chars: settled.chars, rest, samples: s });
  console.log(`\n${a.name}: read ${delays[a.pid]}ms · first message painted at ${firstInk?.t ?? '—'}ms · loading line at ${firstWait?.t ?? '—'}ms`);
  console.log(`  at rest: scrollTop ${rest.scrollTop} of ${rest.scrollHeight - rest.clientHeight} · ${rest.gapToBottom}px still below the fold · ${rest.belowCount} elements out of sight`);
  for (const b of rest.below) console.log(`    ${b.hidden}px below: ${b.cls} — ${b.text}`);
  await shoot(`rest-${a.name.replace(/[^a-z0-9]+/gi, '-')}`);
}

// A PICTURE OF THE WAIT. The read is held at 1500ms for this one shot only, so
// the camera can catch a state that really lasts 508ms on her longest session.
// Nothing else on the screen is changed.
for (const [tag, theme, skin] of [['lake', 'dark', 'lake'], ['white', 'light', 'none']]) {
  if (!HER_SHOT) break;
  await load(theme, skin);
  await evaluate('for (const k of Object.keys(window.__DELAYS__)) window.__DELAYS__[k] = 1500; true');
  await evaluate(`(() => { const r = [...document.querySelectorAll('.row')].find((x) => x.innerText.includes(${JSON.stringify(HER_SHOT.name)})); r && r.click(); return true; })()`);
  await wait(600);
  const skel = await evaluate(`(() => {
    const sk = document.querySelector('.thread-waiting');
    const pane = document.querySelector('.focus-scroll');
    if (!sk || !pane) return null;
    return { skeletonHeight: Math.round(sk.getBoundingClientRect().height), paneHeight: Math.round(pane.clientHeight), bars: sk.querySelectorAll('.sk-line, .sk-name, .sk-did').length, head: sk.querySelector('.thread-head')?.innerText ?? null };
  })()`);
  console.log(`waiting page (${tag}):`, JSON.stringify(skel));
  notes[`waiting-${tag}`] = skel;
  await shoot(`waiting-${tag}-${HER_SHOT.name.replace(/[^a-z0-9]+/gi, '-')}`);
  await wait(1400);
  await shoot(`arrived-${tag}-${HER_SHOT.name.replace(/[^a-z0-9]+/gi, '-')}`);
}

fs.writeFileSync(path.join(outDir, 'measured.json'), JSON.stringify(notes, null, 2));
console.log(`\nwrote ${path.join(outDir, 'measured.json')}`);
server.close();
chrome.kill();
process.exit(0);
