// QUEUED AND HELD WORK, DRAWN APART FROM WORK THAT IS RUNNING (w-ec2b04d449).
//
// The power test found threads waiting their turn drawn exactly like threads
// an agent is on, in the list and on the board, with nothing saying a limit
// held them. This boots the renderer built from the branch on the fleet the
// testers had (two agents up, four waiting their turn, one out of Codex usage,
// one signed out) and photographs every screen the change touches.
//
//   npx vite build renderer && node scripts/draw-queued-and-held-apart.mjs <outDir>
//
// Nothing is injected: what it draws is what the branch draws. It is the
// shutter, not the page.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'renderer', 'dist');
const out = process.argv[2] ?? path.join(root, 'scripts', 'scratch', 'queued-and-held');
fs.mkdirSync(out, { recursive: true });

const NOW = Date.now();
const MIN = 60_000;
const HOUR = 3_600_000;

const products = [
  { slug: 'payments', name: 'Payments API', dir: '/f/payments', repoPath: '/Users/you/dev/payments' },
  { slug: 'web', name: 'Web app', dir: '/f/web', repoPath: '/Users/you/dev/web' },
  { slug: 'mobile', name: 'Mobile', dir: '/f/mobile', repoPath: null },
  { slug: 'infra', name: 'Infra', dir: '/f/infra', repoPath: null },
  { slug: 'data', name: 'Data', dir: '/f/data', repoPath: null },
];
const nameOf = Object.fromEntries(products.map((p) => [p.slug, p.name]));

// Sent to an agent and not answered yet: `threadState` puts these in In
// progress, which is where the testers found them.
const sent = (id, slug, title, { ago, priority = 2, note = null }) => ({
  id, product: slug, productName: nameOf[slug], status: 'open', kind: 'task',
  title, body: title, note, labels: ['founder'], priority, epoch: 1, claim: null,
  createdAt: NOW - ago, updatedAt: NOW - ago,
});

const asks = (id, slug, title, { ago, note, priority = 2 }) => ({
  id, product: slug, productName: nameOf[slug], status: 'open', kind: 'question',
  title, body: title, note, labels: [], priority, epoch: 2, claim: null,
  createdAt: NOW - ago - HOUR, updatedAt: NOW - ago,
});

const items = [
  // IN PROGRESS, the shape of run 1 at 8:31: two agents up, four waiting their
  // turn, one out of usage, one signed out.
  sent('w-work1', 'web', 'Dark mode for the web app, with css variables', {
    ago: 4 * MIN, priority: 6,
    // An agent has already said something here, which is the case that read
    // "Status: Waiting" while it was plainly thinking (run 1, issue 17).
    note: 'The tokens are in three files. I am moving them into one and leaving the old names pointing at it.',
  }),
  sent('w-work2', 'infra', 'Find out why last night’s deploy rolled back', { ago: 40_000, priority: 5 }),
  sent('w-q1', 'payments', 'Write tests for the refund flow', { ago: 6 * MIN, priority: 4 }),
  sent('w-q2', 'payments', 'Review the last three commits for bugs', { ago: 6 * MIN, priority: 4 }),
  sent('w-q3', 'web', 'Rename the pricing helpers so they read the same way', { ago: 9 * MIN, priority: 3 }),
  sent('w-q4', 'mobile', 'A rollout plan for the new pricing page', { ago: 11 * MIN, priority: 3 }),
  sent('w-limit', 'data', 'Port the nightly export to the new schema', { ago: 14 * MIN, priority: 3 }),
  sent('w-signin', 'mobile', 'Audit the API for endpoints nothing calls', { ago: 21 * MIN, priority: 2 }),
  // NEEDS YOU, so the tab strip and the board are not drawn on an empty app.
  asks('w-ask1', 'payments', 'Idempotency keys on the refund endpoint, two ways', {
    ago: 12 * MIN, priority: 6,
    note: 'Two ways to do it. One key per refund request, or one per order with a window on it.',
  }),
  asks('w-ask2', 'web', 'The bundle is 180kb smaller. Ship it?', { ago: 26 * MIN, priority: 5, note: 'Three charts came off the first paint.' }),
  asks('w-ask3', 'infra', 'The failing test was a clock, not the cache', { ago: 48 * MIN, priority: 4, note: 'It passes on a frozen clock.' }),
];

const supervisor = {
  paused: false, pausedProducts: [], capacity: 2,
  productOrder: ['payments', 'web', 'mobile', 'infra', 'data'],
  hiddenProducts: [], personalProducts: [], stalled: [], scheduled: [], shipping: [], silent: {}, runNow: [],
  queued: ['w-q1', 'w-q2', 'w-q3', 'w-q4'],
  atLimit: { 'w-limit': { tool: 'Codex', until: NOW + 52 * MIN } },
  signInNeeded: { 'w-signin': 'Codex' },
  running: [
    {
      itemId: 'w-work1', product: 'web', startedAt: NOW - 4 * MIN,
      activity: [{ id: 'a1', label: 'Editing tokens.css', detail: 'tokens.css', startedAt: NOW - 25_000 }],
      tail: ['tool: Read', 'tool: Edit'],
    },
    {
      // One of the two is in the cloud, which the Status cell says with the
      // cloud in place of the turning dot.
      itemId: 'w-work2', product: 'infra', startedAt: NOW - 40_000, where: 'cloud',
      activity: [{ id: 'a2', label: 'Reading the deploy log', detail: 'deploy.log', startedAt: NOW - 9_000 }],
      tail: ['tool: Bash'],
    },
  ],
};

const snapshot = { products, items, approvals: [], supervisor, restartNeeded: null, config: { pins: [] } };

// The conversation behind each row, in the store's own line shape, so a thread
// opens on what was said rather than on "Nothing has been said here yet."
const history = Object.fromEntries(items.map((it) => {
  const lines = [{
    id: it.id, ts: it.createdAt, source: it.labels.includes('founder') ? 'founder' : 'agent',
    patch: { title: it.title, body: it.body, kind: it.kind, status: 'open', labels: it.labels, priority: it.priority },
  }];
  if (it.note) lines.push({ id: it.id, ts: it.updatedAt, source: 'agent', patch: { note: it.note } });
  return [it.id, lines];
}));

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

const W = 1440, H = 920;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text().slice(0, 160)); });
await page.addInitScript(([snap, lines]) => {
  const known = {
    snapshot: async () => snap,
    itemHistory: async (p) => ({ ok: true, lines: lines[p?.id] ?? [] }),
    // Nothing is waiting to be picked up on a phone, so the offer card stays
    // off these pictures.
    remoteControl: async () => ({ state: 'off', at: 0 }),
    settings: async () => ({ ok: false }),
    dashboard: async () => ({ ok: false }),
    repeats: async () => [],
    sessionTrace: async () => ({ ok: true, sessions: [] }),
    compactionStatus: async () => null,
    codeChange: async () => ({ ok: false }),
    // Signed in on both, so the setup bar stays off these pictures.
    engineSetup: async () => ({ ok: true, phase: 'ready', found: true, signedIn: true }),
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
  localStorage.setItem('zero.theme', 'dark');
  window.addEventListener('error', (e) => { window.__ERR__ = `${e.message} @ ${e.filename ?? ''}`; });
}, [snapshot, history]);

const shoot = async (name) => {
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  await page.waitForTimeout(350);
  const file = path.join(out, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(file);
};

const openTab = async (name) => {
  await page.evaluate((want) => {
    const tab = [...document.querySelectorAll('button, [role="tab"], a')].find((b) => new RegExp(want, 'i').test(b.textContent || ''));
    tab?.click();
  }, name);
  await page.waitForTimeout(800);
};

const start = async ({ board = false, light = false } = {}) => {
  await page.addInitScript(([wantBoard, wantLight]) => {
    localStorage.setItem('threads.display.inbox', JSON.stringify({ view: wantBoard ? 'board' : 'list', sort: 'priority', priorities: [], projects: [], updated: 'any' }));
    // The look is a theme and a skin together: without the skin the saved Dark
    // picture is normalised back over the light theme before the first paint.
    localStorage.setItem('zero.theme', wantLight ? 'light' : 'dark');
    localStorage.setItem('zero.skin', wantLight ? 'none' : 'ember-grid');
    // The app comes back where it was left (where-she-was.ts), so a shot after
    // one of the thread shots would open on that thread and never draw a row.
    localStorage.removeItem('zero.where');
    localStorage.removeItem('zero.alive');
  }, [board, light]);
  await page.goto(origin, { waitUntil: 'load' });
  await page.waitForSelector(board ? '.th-card' : '.row', { timeout: 20_000 });
  await page.waitForTimeout(1000);
};

const openThread = async (id) => {
  await page.evaluate((want) => document.querySelector(`[data-item-id="${want}"] .th-cell-title`)
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true })), id);
  await page.waitForTimeout(1200);
};

/* --------------------------------------------------------------- the run */
// WHERE THE WORDS SIT, MEASURED (w-ec2b04d449): the heading over the column
// and every word under it start on the same x, mark or no mark.
const lineUp = () => page.evaluate(() => {
  const left = (el) => (el ? Math.round(el.getBoundingClientRect().left) : null);
  const head = [...document.querySelectorAll('.th-head .th-grid > div')].find((d) => d.textContent === 'Status');
  const words = [...document.querySelectorAll('.row[data-item-id] .th-cell-state')].map((c) => {
    const first = c.firstChild;
    const box = first?.nodeType === 3 ? (() => { const r = document.createRange(); r.selectNode(first); return Math.round(r.getBoundingClientRect().left); })() : left(first);
    return `${c.innerText.trim()} at ${box}`;
  });
  return `heading at ${left(head)}; ${[...new Set(words)].join(', ')}`;
});

await start();
await openTab('in progress');
await shoot('01-in-progress');
console.log('STATUS CELLS:', await page.evaluate(() => [...document.querySelectorAll('.row[data-item-id]')]
  .map((r) => `${r.querySelector('.th-cell-title')?.innerText} — ${r.querySelector('.th-cell-state')?.innerText}`).join('\n')));
console.log('IN PROGRESS, lined up:', await lineUp());

await openTab('needs you');
await shoot('02-needs-you');
console.log('NEEDS YOU, lined up:', await lineUp());

// The board: the word is inside the card, and nothing sits between cards.
await start({ board: true });
await shoot('03-board');

// The thread an agent is working in, where the panel used to say Waiting.
await start();
await openTab('in progress');
await openThread('w-work1');
await shoot('04-thread-working');
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
await openTab('in progress');
await openThread('w-limit');
await shoot('05-thread-at-its-limit');

// And the light theme, which is the other one she reads in.
await start({ light: true });
await openTab('in progress');
await shoot('06-in-progress-light');

console.log('error:', await page.evaluate(() => window.__ERR__ ?? ''));
await browser.close();
server.close();
