// DOES E MOVE ON AT ONCE WHEN THE APP IS SLOW TO ANSWER (w-1b1a14000a)?
//
//   npm run build   (or: npx vite build renderer)
//   npx vite-node scripts/probe-e-with-a-slow-app.mts <scenario> [shot.png]
//
// The built window, headless, on the fixture inbox, against a stand-in for the
// main process whose answers can be made slow (MS, default 4000). A task is
// opened and E pressed the way a person works through an inbox. Scenarios:
//   fast       three Es, the app answering at once
//   rapid      two Es inside one grace window, the app slow
//   paced      three Es 3.5 s apart, each close already being written
//   impatient  a third E while the second seems stuck, the app slow
//   undo       E, E, then Z inside the second one's window, the app slow
//   frozen     the app stops answering for a while just as E is pressed
// Prints what is on screen after each step and ends with one RESULT line.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { fixtureSnapshot } from '../renderer/src/fixtures';

function playwright() {
  const local = createRequire(import.meta.url);
  try { return local('playwright'); } catch { /* not installed here */ }
  const global = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
  return createRequire(path.join(global, 'noop.js'))('playwright');
}
const { chromium } = playwright();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = process.env.DIST ?? path.join(root, 'renderer', 'dist');
const scenario = process.argv[2] ?? 'fast';
const MS = Number(process.env.MS ?? 4000);

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  let file = path.join(dist, decodeURIComponent(url.pathname));
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [];
page.on('pageerror', (e: Error) => errors.push(String(e.stack).slice(0, 600)));
await page.addInitScript(({ snap }: { snap: unknown }) => {
  const state: any = { snap, answerMs: 0, snapMs: 0, frozenUntil: 0, calls: [] };
  (window as any).__fake = state;
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  // A frozen main answers nothing until it thaws.
  const thaw = async (ms: number) => { await wait(ms); const left = state.frozenUntil - Date.now(); if (left > 0) await wait(left); };
  const base: Record<string, unknown> = {
    snapshot: async () => { await thaw(state.snapMs); return structuredClone(state.snap); },
    answer: async (p: any) => {
      state.calls.push([p.id, p.status ?? null]);
      await thaw(state.answerMs);
      const it = state.snap.items.find((i: any) => i.id === p.id && i.product === p.product);
      if (it && p.status) { it.status = p.status; it.updatedAt = Date.now(); }
      return it ?? null;
    },
    bootInfo: async () => ({}),
    repeats: async () => [],
    sessionTrace: async () => ({ sessions: [] }),
  };
  (window as any).zero = new Proxy(base, {
    get(t, k) {
      if (k in t) return t[k as string];
      if (typeof k !== 'string') return undefined;
      if (k.startsWith('on')) return () => () => {};
      return async () => null;
    },
  });
  localStorage.setItem('zero.firstRun.done', '1');
  localStorage.setItem('zero.theme', 'dark');
  localStorage.setItem('zero.deliveredThrough', '0');
  localStorage.setItem('threads.display.inbox', JSON.stringify({ view: 'list' }));
}, { snap: fixtureSnapshot });

await page.goto(origin);
await page.waitForTimeout(2500);

const openTitle = (): Promise<string | null> => page.evaluate(() => {
  const open = document.querySelector('.workspace-task-header') as HTMLElement | null;
  return open ? (open.innerText || '').replace(/\s+/g, ' ').slice(0, 70) : null;
});
const key = (k: string) => page.keyboard.press(k);
const slow = (o: object) => page.evaluate((o: object) => Object.assign((window as any).__fake, o), o);
const pause = (ms: number) => page.waitForTimeout(ms);

const closed: string[] = [];
const faults: string[] = [];
let shown = await openTitle();
async function look(what: string) {
  const now = await openTitle();
  console.log(what.padEnd(30), now ?? '(the list)');
  if (now && closed.includes(now)) faults.push(`${what}: reopened a task already closed`);
  shown = now;
}
async function e(what: string, ms = 400) {
  const was = shown;
  await key('e');
  await pause(ms);
  await look(what);
  if (was && shown === was) faults.push(`${what}: still on the task E closed`);
  if (was) closed.push(was);
}

await key('Enter');
await pause(700);
await look('opened the first task');

if (scenario === 'fast') {
  for (let n = 1; n <= 3; n += 1) await e(`E #${n}`, 700);
} else if (scenario === 'rapid') {
  await slow({ answerMs: MS, snapMs: MS });
  await e('E #1');
  await e('E #2');
  await pause(MS * 2); await look(`after ${MS * 2} ms`);
} else if (scenario === 'paced') {
  // Read for a moment between Es, so each close is already being written.
  await slow({ answerMs: MS, snapMs: MS });
  await e('E #1', 3500);
  await e('E #2', 3500);
  await e('E #3', 600);
  await pause(MS * 2); await look(`after ${MS * 2} ms`);
} else if (scenario === 'paced-then-read') {
  // The same, then the task E #2 opened is read and nothing pressed.
  await slow({ answerMs: MS, snapMs: MS });
  await e('E #1', 3500);
  await e('E #2', 600);
  for (let n = 1; n <= 6; n += 1) { await pause(2000); await look(`reading, +${n * 2} s`); }
} else if (scenario === 'impatient') {
  await slow({ answerMs: MS, snapMs: MS });
  await e('E #1', 600);
  await e('E #2', 900);
  await e('E #3, pressed again', 900);
  await pause(MS * 3); await look(`after ${MS * 3} ms`);
} else if (scenario === 'undo') {
  await slow({ answerMs: MS, snapMs: MS });
  await e('E #1', 600);
  const second = shown;
  await e('E #2', 600);
  // Z takes that close back, so the task no longer counts as closed.
  closed.splice(closed.indexOf(second as string), 1);
  await key('z'); await pause(400); await look('Z');
  if (shown !== second) faults.push('Z did not bring back the task it took back');
  await pause(MS * 3); await look(`after ${MS * 3} ms`);
} else if (scenario === 'frozen') {
  await e('E #1', 1500);
  await slow({ frozenUntil: Date.now() + MS });
  await e('E #2, the app not answering', 300);
  await pause(MS + 1500); await look('after it answers again');
  await e('E #3');
} else {
  console.log(`no scenario called ${scenario}`);
}

if (process.argv[3]) await page.screenshot({ path: process.argv[3] });
const writes = await page.evaluate(() => (window as any).__fake.calls);
console.log('written', JSON.stringify(writes));
if (errors.length) console.log('page errors', errors.slice(0, 3));
console.log(faults.length ? `RESULT: ${faults.join('; ')}` : 'RESULT: every E moved on at once and no closed task came back');
await browser.close();
server.close();
