// DOES THE APP GET SLOWER THE LONGER IT RUNS UNDER A STEADY LOAD.
//
//   node scripts/run.mjs scripts/measure-speed.mjs --fresh --threads 200 --stranded 400 --idle 1
//   node scripts/run.mjs scripts/measure-long-run.mjs [--minutes 22] [--agents 6] [--click Inbox] [--heap after.heapsnapshot]
//
// Runs on the made-up inbox scripts/measure-speed.mjs leaves in the temp
// folder. The load: an update every 400 ms, a note written on one of `agents`
// threads every 5 s, and once a minute a person's keys (down two, open the
// thread, read it, back). Prints one line a minute for the window and one for
// the back end. A column that climbs in a straight line is something left
// behind; --heap saves the window's memory at the end for
// scripts/who-holds-detached.mjs to say what holds it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
const minutes = Number(flag('minutes', 22));
const agents = Number(flag('agents', 6));
const root = path.join(os.tmpdir(), 'agentbox-speed');
if (!fs.existsSync(path.join(root, 'data', 'zero.config.json'))) throw new Error('No made-up inbox: run scripts/measure-speed.mjs --fresh first.');
const timings = path.join(root, 'data', 'timings.jsonl');
fs.rmSync(timings, { force: true });
const port = 4900 + Math.floor(Math.random() * 90);
const env = { PATH: process.env.PATH, TMPDIR: os.tmpdir(), NODE_OPTIONS: process.env.NODE_OPTIONS ?? '', HOME: path.join(root, 'home'), AGENTBOX_FRESH_USER: '1' };
const app = spawn(process.execPath, [path.join(repo, 'scripts', 'measure-speed.mjs'), '--serve', String(port), '--streaming'], { env, stdio: ['ignore', 'pipe', 'inherit'], detached: true });
const stop = () => { try { process.kill(-app.pid, 'SIGKILL'); } catch { /* already gone */ } };
const url = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('the app did not start in 2 minutes')), 120_000);
  app.stdout.on('data', (b) => { const m = String(b).match(/up: (\S+)/); if (m) { clearTimeout(timer); resolve(m[1]); } });
  app.on('exit', (code) => reject(new Error(`the app quit with ${code}`)));
});

// One open thread per project is written on, the way a running agent writes on its own.
const projects = path.join(root, 'store', 'projects');
const writers = [];
for (const dir of fs.readdirSync(projects)) {
  const file = path.join(projects, dir, 'work-items.jsonl');
  if (!fs.existsSync(file)) continue;
  const last = new Map();
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    const l = JSON.parse(line);
    if (l.patch?.status) last.set(l.id, l.patch.status);
  }
  const open = [...last].find(([, status]) => status === 'open');
  if (open && writers.length < agents) writers.push({ file, id: open[0] });
}
const words = 'the agent read the file ran the tests fixed the break and wrote what it found into the thread for the person to read'.split(' ');
const text = (n) => Array.from({ length: n }, () => words[Math.floor(Math.random() * words.length)]).join(' ');
let notes = 0;
const writing = setInterval(() => {
  const w = writers[notes % writers.length];
  notes += 1;
  fs.appendFileSync(w.file, `${JSON.stringify({ id: w.id, ts: Date.now(), source: 'agent', patch: { note: text(120), progress: text(30) } })}\n`);
}, 5000);

const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
const pad = (v, n) => String(v).padStart(n);
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => {
    localStorage.setItem('zero.firstRun.done', '1');
    window.__frames = [];
    window.__long = [];
    let last = performance.now();
    const loop = (t) => { window.__frames.push(t - last); last = t; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(Math.round(e.duration)); }).observe({ entryTypes: ['longtask'] }); } catch { /* no long-task timing here */ }
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('HeapProfiler.enable');
  const metrics = async () => {
    const { metrics: m } = await cdp.send('Performance.getMetrics');
    const of = (name) => m.find((x) => x.name === name)?.value ?? 0;
    return { task: of('TaskDuration'), heap: of('JSHeapUsedSize'), nodes: of('Nodes'), listeners: of('JSEventListeners') };
  };
  await page.goto(url);
  await page.waitForTimeout(8000);
  if (flag('click', null)) { await page.getByText(flag('click'), { exact: true }).first().click(); await page.waitForTimeout(3000); }
  console.log(`The window, a minute a line, ${writers.length} threads written on:`);
  console.log('min  busy  each update  frames late by 50 ms  by 100 ms  worst  heap MB  elements  listeners');
  let before = await metrics();
  let t0 = Date.now();
  for (let minute = 1; minute <= minutes; minute += 1) {
    await page.evaluate(() => { window.__frames = []; window.__long = []; });
    await page.waitForTimeout(52_000);
    await page.keyboard.press('j');
    await page.waitForTimeout(300);
    await page.keyboard.press('j');
    await page.waitForTimeout(300);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(2000);
    const f = (await page.evaluate(() => window.__frames));
    // Collected first, so heap, elements and listeners count only what is still held.
    await cdp.send('HeapProfiler.collectGarbage');
    const now = await metrics();
    const busy = (now.task - before.task) / ((Date.now() - t0) / 1000);
    console.log(`${pad(minute, 3)} ${pad(Math.round(busy * 100), 4)}% ${pad(Math.round(busy * 400), 9)} ms ${pad(f.filter((x) => x > 50).length, 21)} ${pad(f.filter((x) => x > 100).length, 10)} ${pad(Math.round(Math.max(0, ...f)), 6)} ${pad(Math.round(now.heap / 1048576), 8)} ${pad(now.nodes, 9)} ${pad(now.listeners, 10)}`);
    before = now;
    t0 = Date.now();
  }
  if (flag('heap', null)) {
    const chunks = [];
    cdp.on('HeapProfiler.addHeapSnapshotChunk', (e) => chunks.push(e.chunk));
    await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
    fs.writeFileSync(flag('heap'), chunks.join(''));
    console.log(`The window's memory at the end: ${flag('heap')}`);
  }
} finally {
  clearInterval(writing);
  await browser.close();
  stop();
}

const lines = fs.readFileSync(timings, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const start = lines[0].t;
console.log('\nThe back end, a minute a line:');
console.log('min  inbox reads  average ms  longest  resident MB  heap MB  collecting ms  freezes  share of a core');
for (let minute = 1; minute <= minutes + 1; minute += 1) {
  const within = lines.filter((l) => l.t >= start + (minute - 1) * 60_000 && l.t < start + minute * 60_000);
  const reads = within.filter((l) => l.channel === 'zero:snapshot').map((l) => l.ms);
  const mems = within.filter((l) => l.mem);
  if (!reads.length || mems.length < 2) continue;
  const gcs = within.filter((l) => l.gc != null);
  const cpu = Math.round(((mems[mems.length - 1].cpuMs - mems[0].cpuMs) / (mems[mems.length - 1].t - mems[0].t)) * 100);
  console.log(`${pad(minute, 3)} ${pad(reads.length, 12)} ${pad(Math.round(reads.reduce((a, b) => a + b, 0) / reads.length), 11)} ${pad(Math.max(...reads), 8)} ${pad(Math.max(...mems.map((l) => l.mem.rss)), 12)} ${pad(Math.min(...mems.map((l) => l.mem.heap)), 8)} ${pad(Math.round(gcs.reduce((a, l) => a + l.gc, 0)), 14)} ${pad(within.filter((l) => l.freeze).length, 8)} ${pad(cpu, 15)}%`);
}
