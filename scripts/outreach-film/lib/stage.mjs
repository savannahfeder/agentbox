// The app's own built screen in a browser, in demo mode, with the film's world
// in place of the canned one. The page's api.ts reads window.__DEMO__ (a hook
// that exists only in the scratch build), so every reply, approval and new
// thread changes the world the way a real store would.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium, chromePath } from './browser.mjs';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.json': 'application/json', '.ttf': 'font/ttf' };

function serve(root, extra = {}) {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = extra[p] ?? path.join(root, p);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

// Runs before the app loads: the page's clocks and timers run S times slower,
// so a busy machine still renders every moment; the film is sped back up after.
function slowInit(S) {
  if (!S || S === 1) return;
  const rp = performance.now.bind(performance), p0 = rp();
  performance.now = () => p0 + (rp() - p0) / S;
  const RealDate = Date, rd = RealDate.now, d0 = rd();
  const scaledNow = () => d0 + (rd() - d0) / S;
  function D(...a) { if (!new.target) return new RealDate(scaledNow()).toString(); return a.length ? new RealDate(...a) : new RealDate(scaledNow()); }
  D.prototype = RealDate.prototype; D.now = scaledNow; D.parse = RealDate.parse; D.UTC = RealDate.UTC;
  window.Date = D;
  const rST = window.setTimeout.bind(window), rSI = window.setInterval.bind(window), rRAF = window.requestAnimationFrame.bind(window);
  window.setTimeout = (fn, ms, ...a) => rST(fn, (Number(ms) || 0) * S, ...a);
  window.setInterval = (fn, ms, ...a) => rSI(fn, (Number(ms) || 0) * S, ...a);
  // A frame's own timestamp follows the slowed animation timeline and stalls
  // while the camera holds frames back, so callbacks get the page clock instead.
  window.requestAnimationFrame = (cb) => rRAF(() => cb(performance.now()));
}

// Runs in the page before the app loads.
function demoInit({ seed, theme }) {
  localStorage.setItem('zero.theme', 'dark');
  localStorage.setItem('zero.sky.theme', theme);
  localStorage.setItem('zero.alpha.home', '1');
  localStorage.setItem('zero.firstRun.done', '1');
  localStorage.setItem('zero.deliveredThrough', '1');
  localStorage.setItem('zero.keyhints', '0');
  Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'MacIntel' });
  const listeners = new Set();
  let state = null;
  const notify = () => setTimeout(() => { for (const fn of listeners) { try { fn(); } catch (e) { console.error(e); } } }, 30);
  const build = () => {
    const F = window.__FIXTURE__;
    const base = F ? structuredClone(F.snapshot) : {};
    const s = { ...base, ...structuredClone(seed) };
    for (const i of s.items) if (i.result) i.result = i.result.split('{ORIGIN}').join(location.origin);
    if (F) s.engines = { choices: F.engines, workspace: 'claude', byItem: Object.fromEntries(s.items.filter((i) => i.engine).map((i) => [i.id, i.engine])) };
    delete s.byKey;
    return s;
  };
  const find = (id) => state.items.find((i) => i.id === id);
  window.__DEMO__ = {
    listeners,
    changes: {},
    change(src) { return this.changes[src] ?? null; },
    get state() { if (!state) state = build(); return state; },
    answer(p) {
      const item = find(p.id); if (!item) return null;
      const now = Date.now();
      if (p.answer) { item.answer = p.answer; item.answeredThrough = now; item.wrote = { ...(item.wrote ?? {}), answer: { ts: now, source: 'founder' } }; }
      if (p.status) item.status = p.status;
      item.updatedAt = now;
      if (p.answer && p.status !== 'done') {
        item.status = 'claimed';
        state.supervisor.running.push({ itemId: item.id, product: item.product, startedAt: now, tail: ['Working on your reply'], engine: item.engine });
      }
      notify();
      return structuredClone(item);
    },
    compose(p) {
      const now = Date.now();
      const item = { id: `w-${now.toString(16).slice(-10)}`, product: p.product, productName: state.products.find((x) => x.slug === p.product)?.name ?? p.product,
        status: 'claimed', title: p.title, body: p.body ?? p.title, kind: p.kind ?? 'directive', labels: ['founder'], priority: p.priority ?? 5, epoch: 1, claim: null,
        engine: p.engine ?? 'claude', createdAt: now, updatedAt: now, wrote: { title: { ts: now, source: 'founder' }, body: { ts: now, source: 'founder' } } };
      state.items.push(item);
      state.supervisor.running.push({ itemId: item.id, product: p.product, startedAt: now, tail: ['Reading the codebase'], engine: item.engine });
      notify();
      return structuredClone(item);
    },
    history(id) {
      const i = find(id); if (!i) return [];
      const lines = [{ id: i.id, ts: i.createdAt, source: 'founder', ...(i.createdBy && i.createdBy !== 'me' ? { by: i.createdBy } : {}), patch: { title: i.title, body: i.ask ?? i.body, status: 'open', kind: i.kind, priority: i.priority } }];
      if (i.result) lines.push({ id: i.id, ts: i.wrote?.result?.ts ?? i.updatedAt, source: 'agent', patch: { status: 'open', result: i.result } });
      if (i.answer) lines.push({ id: i.id, ts: i.wrote?.answer?.ts ?? i.updatedAt, source: 'founder', patch: { answer: i.answer } });
      return lines;
    },
    trace() { return []; },
  };
  window.__demoNotify = notify;
  const teamOk = () => ({ ok: true, team: structuredClone(window.__DEMO__.state.team) });
  window.zero = {
    approve: async ({ id }) => { const s = window.__DEMO__.state; s.approvals = s.approvals.filter((a) => a.id !== id); notify(); return { ok: true }; },
    openArtifact: async (p) => (window.__DEMO__.changes[p.src] ? { ok: true, opened: p.src } : { ok: false, error: 'That file could not be found.' }),
    teamSignIn: async () => teamOk(),
    teamSync: async () => teamOk(),
    teamComment: async (p) => { const w = (window.__DEMO__.work ??= {}); (w[p.threadId] ??= []).push({ id: p.threadId, ts: Date.now(), source: 'founder', by: 'me', patch: { comment: { text: p.text } } }); notify(); return teamOk(); },
    teamThreadWork: async ({ personId, threadId }) => {
      const w = (window.__DEMO__.work ?? {})[threadId];
      return w ? { shared: true, earlier: 0, product: null, dir: null, lines: [...w] } : { shared: false, lines: [], earlier: 0, product: null, dir: null };
    },
  };
  window.addEventListener('error', (e) => { window.__ERR__ = String(e.message); });
}

export async function openStage({ dist, seed, theme = 'ember', width = 1440, height = 810, extra = {}, query = 'fixtures=1', slow = 1, dsf = 1920 / width }) {
  const server = await serve(dist, extra);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: chromePath(), args: ['--hide-scrollbars', '--font-render-hinting=none'] });
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dsf, colorScheme: 'dark', timezoneId: 'America/Los_Angeles', locale: 'en-US' });
  await context.addInitScript(slowInit, slow);
  await context.addInitScript(demoInit, { seed, theme });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text().slice(0, 200)); });
  const cdp = await context.newCDPSession(page);
  await page.goto(`${origin}/?${query}`);
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.waitForTimeout(1500 * slow);
  return { page, context, cdp, origin, async close() { await context.close(); await browser.close(); server.close(); } };
}
