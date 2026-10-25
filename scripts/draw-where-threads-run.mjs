// WHY A THREAD IS NOT IN THE CLOUD, ON SCREEN (w-de59f3ff12).
//
// With the cloud on Everything, four threads ran locally and two said Queued,
// and nothing said why. This boots the built renderer on that fleet (four in
// the cloud, four local, one waiting for the cloud, one waiting for this
// computer) and photographs In progress at rest and with a Status card open,
// on a 3440 by 1440 screen, in light, and on a laptop.
//
//   npx vite build renderer && node scripts/draw-where-threads-run.mjs <outDir> [shot ...]
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'renderer', 'dist');
const out = process.argv[2] ?? path.join(root, 'scripts', 'scratch', 'where-threads-run');
const only = process.argv.slice(3);
fs.mkdirSync(out, { recursive: true });

const NOW = Date.now();
const MIN = 60_000;

const products = [
  { slug: 'agentbox-team', name: 'Agentbox Team', dir: '/f/agentbox-team', repoPath: '/Users/you/dev/agentbox-team' },
  { slug: 'my-workspace', name: 'My Workspace', dir: '/f/my-workspace', repoPath: null },
];
const nameOf = Object.fromEntries(products.map((p) => [p.slug, p.name]));

const sent = (id, title, { ago, priority = 5, slug = 'agentbox-team', visibility = 'team' }) => ({
  id, product: slug, productName: nameOf[slug], status: 'open', kind: 'directive',
  title, label: title, body: title, note: null, labels: ['founder'], priority, epoch: 1, claim: null, visibility,
  createdAt: NOW - ago - 30 * MIN, updatedAt: NOW - ago,
});

const items = [
  sent('w-ready', 'AgentBox Cloud release readiness check', { ago: 20_000, priority: 7 }),
  sent('w-stress', 'Extended cloud system stress test', { ago: 30_000, priority: 7 }),
  sent('w-mobile', 'AgentBox mobile app planning', { ago: 70_000, priority: 7 }),
  sent('w-groups', 'Unified groups concept', { ago: 80_000, priority: 7 }),
  sent('w-missing', 'Find missing agent for recent changes', { ago: 40_000 }),
  sent('w-comply', 'Agentbox Anthropic compliance', { ago: 45_000 }),
  sent('w-search', 'Agentbox discoverability in search and AI', { ago: 50_000 }),
  sent('w-images', 'Investigate image loading slowness', { ago: 90_000 }),
  sent('w-progress', 'In Progress discoverability', { ago: 95_000 }),
  sent('w-cards', 'Morning price check', { ago: 25_000, priority: 7, slug: 'my-workspace', visibility: 'private' }),
];

const run = (itemId, { where, ago, doing, product = 'agentbox-team' }) => ({
  itemId, product, startedAt: NOW - ago, ...(where ? { where } : {}),
  activity: [{ id: `${itemId}-a`, label: doing, detail: doing, startedAt: NOW - 8_000 }], tail: ['tool: Bash'],
});

const supervisor = {
  paused: false, pausedProducts: [], capacity: 4,
  productOrder: ['agentbox-team', 'my-workspace'],
  hiddenProducts: [], personalProducts: [], stalled: [], scheduled: [], shipping: [], silent: {}, runNow: [],
  queued: ['w-comply', 'w-search'],
  running: [
    run('w-ready', { ago: 6 * MIN, doing: 'Reading the gateway deploy script' }),
    run('w-stress', { ago: 140 * MIN, doing: 'Restarting the second copy of the app' }),
    run('w-mobile', { ago: 4 * MIN, doing: 'Reading the image loader' }),
    run('w-cards', { ago: 3 * MIN, doing: 'Reading today’s prices', product: 'my-workspace' }),
    run('w-groups', { where: 'cloud', ago: 9 * MIN, doing: 'Drawing the groups page' }),
    run('w-missing', { where: 'cloud', ago: 2 * MIN, doing: 'Reading the cloud hand-back code' }),
    run('w-images', { where: 'cloud', ago: 11 * MIN, doing: 'Timing image loads' }),
    run('w-progress', { where: 'cloud', ago: 5 * MIN, doing: 'Merging the cloud branch' }),
  ],
  // A cloud run's own words for what it lacked, a thread kept local, and two waits.
  whyNotCloud: {
    'w-ready': { at: 'mac', why: 'handed-back', detail: 'your AWS sign-in' },
    'w-stress': { at: 'mac', why: 'handed-back', detail: 'copies of the app running on this computer' },
    'w-mobile': { at: 'mac', why: 'handed-back', detail: 'your phone on the same Wi-Fi' },
    'w-cards': { at: 'mac', why: 'kept' },
    'w-comply': { at: 'wait-cloud', why: 'two-at-a-time' },
    'w-search': { at: 'wait-mac', why: 'handed-back', detail: 'the website code' },
  },
};

const cloud = {
  setUp: true, managed: true, mode: 'all', whenOn: 'all', running: 4,
  month: { runs: 212, agentHours: 70.3, estimatedCost: 0, costPerAgentHour: null },
  accounts: ['a', 'b', 'c'].map((k, i) => ({ engine: 'claude', key: `acct-${k}0000`, name: `account${i + 1}@example.com`, ready: true, state: 'ready' })),
  signIns: [], health: 'ok', noRoom: null, versionGap: null, projects: ['agentbox-team', 'my-workspace'],
};

const snapshot = { products, items, approvals: [], supervisor, cloud, restartNeeded: null, config: { pins: [] } };

const history = Object.fromEntries(items.map((it) => [it.id, [{
  id: it.id, ts: it.createdAt, source: 'founder',
  patch: { title: it.title, body: it.body, kind: it.kind, status: 'open', labels: it.labels, priority: it.priority },
}]]));

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let file = path.join(dist, decodeURIComponent(url.pathname));
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

// Her screen: 3440 by 1440, with the app drawn at 1.2 device pixels to the point.
const SCALE = 1.2;
const W = Math.round(3440 / SCALE), H = Math.round(1440 / SCALE);
const browser = await chromium.launch();

async function draw(name, { light = false, hover = null, laptop = false } = {}) {
  // A 14-inch MacBook's default: 1512 by 982 points, at 2.
  const view = laptop ? { width: 1512, height: 982, scale: 2 } : { width: W, height: H, scale: SCALE };
  const page = await browser.newPage({ viewport: { width: view.width, height: view.height }, deviceScaleFactor: view.scale });
  page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text().slice(0, 160)); });
  page.on('pageerror', (e) => console.error('page:', e.message.slice(0, 300)));
  await page.addInitScript(([snap, lines, wantLight]) => {
    const known = {
      snapshot: async () => snap,
      itemHistory: async (p) => ({ ok: true, lines: lines[p?.id] ?? [] }),
      remoteControl: async () => ({ state: 'off', at: 0 }),
      settings: async () => ({ ok: false }),
      dashboard: async () => ({ ok: false }),
      repeats: async () => [],
      sessionTrace: async () => ({ ok: true, sessions: [] }),
      compactionStatus: async () => null,
      codeChange: async () => ({ ok: false }),
      engineSetup: async () => ({ ok: true, phase: 'ready', found: true, signedIn: true }),
      // No room invite waiting, or a toast about Rooms covers the corner.
      takeJoin: async () => null,
    };
    window.zero = new Proxy(known, {
      get(target, key) {
        if (key in target) return target[key];
        if (typeof key === 'string' && key.startsWith('on')) return () => () => {};
        return async () => ({ ok: false });
      },
      has: () => true,
    });
    localStorage.setItem('zero.firstRun.done', '1');
    localStorage.setItem('threads.display.inbox', JSON.stringify({ view: 'list', sort: 'priority', priorities: [], projects: [], updated: 'any' }));
    localStorage.setItem('zero.theme', wantLight ? 'light' : 'dark');
    localStorage.setItem('zero.skin', wantLight ? 'none' : 'ember-grid');
    localStorage.removeItem('zero.where');
    localStorage.removeItem('zero.alive');
    window.addEventListener('error', (e) => { window.__ERR__ = `${e.message} @ ${e.filename ?? ''}`; });
  }, [snapshot, history, light]);
  await page.goto(origin, { waitUntil: 'load' });
  await page.waitForFunction(() => [...document.querySelectorAll('button, [role="tab"], a')].some((b) => /in progress/i.test(b.textContent || '')), null, { timeout: 20_000 });
  await page.evaluate(() => {
    const tab = [...document.querySelectorAll('button, [role="tab"], a')].find((b) => /in progress/i.test(b.textContent || ''));
    tab?.click();
  });
  await page.waitForSelector('.row[data-item-id]', { timeout: 20_000 });
  await page.waitForTimeout(800);
  if (hover) await page.hover(hover);
  else await page.mouse.move(view.width - 2, view.height - 2);
  await page.waitForTimeout(400);
  const file = path.join(out, `${name}.png`);
  await page.screenshot({ path: file });
  const err = await page.evaluate(() => window.__ERR__ ?? '');
  if (err) console.error(name, 'error:', err);
  console.log(file);
  await page.close();
}

const status = (id) => `[data-item-id="${id}"] .th-cell-state`;
const SHOTS = [
  ['1-in-progress', {}],
  ['2-a-local-thread-hovered', { hover: status('w-ready') }],
  ['3-a-queued-thread-hovered', { hover: status('w-comply') }],
  ['4-light-a-local-thread-hovered', { hover: status('w-ready'), light: true }],
  ['5-laptop-a-local-thread-hovered', { hover: status('w-ready'), laptop: true }],
];
for (const [name, opts] of SHOTS) if (!only.length || only.some((o) => name.startsWith(o))) await draw(name, opts);

await browser.close();
server.close();
