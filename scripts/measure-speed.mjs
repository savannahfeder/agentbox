// WHERE THE APP'S MAIN THREAD SPENDS ITS TIME, ON A BIG INBOX.
//
//   node scripts/measure-speed.mjs [--projects 8] [--threads 400] [--stranded 800] [--fresh]
//
// Makes a made-up store (projects × threads, long histories, most finished),
// starts the browser copy of the app on it in a child process with the freeze
// recorder on, presses keys the way a person works an inbox, idles, and prints:
// each request's synchronous time, each agents'-clock tick, and every freeze
// with its stack. Run it before and after a speed fix and compare.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { PerformanceObserver, constants, monitorEventLoopDelay, performance } from 'node:perf_hooks';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
const root = path.join(os.tmpdir(), 'agentbox-speed');
const data = path.join(root, 'data');
const timings = path.join(data, 'timings.jsonl');
const log = (o) => fs.appendFileSync(timings, `${JSON.stringify({ t: Date.now(), ...o })}\n`);
// Threads whose last run ended and left them where they were: the agents' clock
// walks these every tick. A real store measured 2026-11-04 had 747 of them with
// logs of 4 KB at the median, so --stranded defaults near that.
const STRANDED_LOG_KB = 4;

if (args[0] === '--serve') await serve(Number(args[1]));
else await measure();

function strandedLog(id) {
  let text = `# ${id} · spawned 2026-08-27T22:25:22.807Z\n\n`;
  for (let n = 0; text.length < STRANDED_LOG_KB * 1024; n += 1) text += `22:${String(n % 60).padStart(2, '0')}:29  [Bash] npm run test:changed\n`;
  return `${text}\n# exited (0) 2026-08-27T22:31:01.414Z\n`;
}

async function makeStore(projects, perProject, strandedCount) {
  const storeRoot = path.join(root, 'store');
  const accountRoot = path.join(storeRoot, 'accounts', 'speed');
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(data, { recursive: true });
  fs.mkdirSync(path.join(root, 'home'), { recursive: true });
  fs.writeFileSync(path.join(data, 'zero.config.json'), JSON.stringify({ storeRoot, accountId: 'speed', engineChoice: '2026-01-01T00:00:00.000Z', maxConcurrentSessions: 2 }, null, 2));
  const { storeRootEnv, machineryPath } = await import('../main/store/home.mts');
  Object.assign(process.env, storeRootEnv(storeRoot));
  const { buildLine } = await import('../shared/work-items.mts');
  const words = 'the app froze when she pressed E and the inbox moved on to the next task while a worker wrote its answer report.md into the store'.split(' ');
  const text = (n) => Array.from({ length: n }, () => words[Math.floor(Math.random() * words.length)]).join(' ');
  const now = Date.now();
  const strandedPerProject = Math.ceil(strandedCount / projects);
  const fruitless = {};
  for (let p = 0; p < projects; p += 1) {
    const slug = `project-${p}`;
    const dir = path.join(accountRoot, slug);
    const repoDir = path.join(root, 'repos', slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(repoDir, { recursive: true });
    fs.writeFileSync(path.join(repoDir, 'README.md'), `# ${slug}\n`);
    const git = (...a) => execFileSync('git', ['-c', 'user.email=speed@x.invalid', '-c', 'user.name=speed', ...a], { cwd: repoDir, stdio: 'ignore' });
    git('init', '-q', '-b', 'main');
    git('add', '-A');
    git('commit', '-qm', 'seed');
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 2, id: slug, name: `Project ${p}`, repoPath: repoDir }));
    const lines = [];
    for (let i = 0; i < perProject; i += 1) {
      const id = `w-${crypto.randomBytes(5).toString('hex')}`;
      // The stranded ones are open, unanswered and waiting: what the pass walks.
      const stranded = i < strandedPerProject;
      let t = now - Math.floor(Math.random() * 30 * 86_400_000);
      lines.push(buildLine({ id, patch: { title: text(12), body: text(80), status: 'open', labels: ['founder'] }, source: 'founder', now: t }));
      for (let r = 0, rounds = 3 + Math.floor(Math.random() * 10); r < rounds; r += 1) {
        t += 60_000 + Math.floor(Math.random() * 3_600_000);
        lines.push(buildLine({ id, patch: { note: text(60 + Math.floor(Math.random() * 200)), problem: text(30), progress: text(40) }, now: t }));
        if (!stranded && r % 3 === 2) lines.push(buildLine({ id, patch: { answer: text(30) }, source: 'founder', now: t + 1000 }));
      }
      const status = stranded ? 'open' : Math.random() < 0.8 ? 'done' : Math.random() < 0.5 ? 'blocked' : 'open';
      lines.push(buildLine({ id, patch: { status, result: text(120) }, now: t + 5000 }));
      if (!stranded) continue;
      const log = machineryPath(dir, path.join('sessions', id, '1787863899445.log'));
      fs.mkdirSync(path.dirname(log), { recursive: true });
      fs.writeFileSync(log, strandedLog(id));
      // Later than everything written on the thread, so the pass reads it as a
      // run that ended after the last word anybody said there.
      fruitless[`${slug}:${id}`] = { runs: 1, endedAt: now };
    }
    const file = machineryPath(dir, 'work-items.jsonl');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${lines.sort((a, b) => a.ts - b.ts).map((l) => JSON.stringify(l)).join('\n')}\n`);
  }
  fs.writeFileSync(path.join(storeRoot, '.zero-supervisor.json'), JSON.stringify({ fruitless }));
}

async function serve(port) {
  const { bootHeadless, createServer, newToken, picturesTheAppOwns } = await import('../main/serve.mts');
  const { startFreezeRecorder } = await import('../main/freeze-recorder.mts');
  const booted = await bootHeadless({ dataDir: data, appDir: repo, userDir: data });
  startFreezeRecorder({ dir: path.join(data, 'memory-log'), appDir: repo, thresholdMs: 200, onFreeze: (f) => log({ freeze: f }) });
  for (const [channel, fn] of booted.channels) {
    booted.channels.set(channel, (...a) => {
      const start = performance.now();
      try { return fn(...a); } finally { log({ channel, ms: Math.round(performance.now() - start) }); }
    });
  }
  const sup = booted.supervisor;
  const tick = sup._tick.bind(sup);
  sup._tick = async (...a) => { const start = performance.now(); try { return await tick(...a); } finally { log({ tick: Math.round(performance.now() - start) }); } };
  const loop = monitorEventLoopDelay({ resolution: 10 });
  loop.enable();
  setInterval(() => { log({ loopMax: Math.round(loop.max / 1e6) }); loop.reset(); }, 5000).unref();
  // On a swapping Mac each collection pages the heap back in, so how often it runs matters.
  new PerformanceObserver((list) => { for (const e of list.getEntries()) log({ gc: Math.round(e.duration * 10) / 10, major: e.detail?.kind === constants.NODE_PERFORMANCE_GC_MAJOR }); }).observe({ entryTypes: ['gc'] });
  sup.start();
  const token = newToken();
  createServer({ channels: booted.channels, token, listeners: booted.window.listeners, dist: path.join(repo, 'renderer', 'dist'), files: picturesTheAppOwns(booted) })
    .listen(port, '127.0.0.1', () => console.log(`up: http://127.0.0.1:${port}/?token=${token}`));
}

function playwright() {
  const here = createRequire(import.meta.url);
  try { return here('playwright'); } catch { /* not installed here */ }
  const global = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
  return createRequire(path.join(global, 'noop.js'))('playwright');
}

async function measure() {
  if (!fs.existsSync(path.join(repo, 'renderer', 'dist', 'index.html'))) throw new Error('No built screen: run npx vite build renderer first.');
  const projects = Number(flag('projects', 8));
  const perProject = Number(flag('threads', 400));
  const stranded = Number(flag('stranded', 800));
  if (args.includes('--fresh') || !fs.existsSync(path.join(data, 'zero.config.json'))) await makeStore(projects, perProject, stranded);
  fs.rmSync(timings, { force: true });
  fs.rmSync(path.join(data, 'memory-log'), { recursive: true, force: true });
  const port = 4700 + Math.floor(Math.random() * 200);
  const env = { PATH: process.env.PATH, HOME: path.join(root, 'home'), AGENTBOX_FRESH_USER: '1' };
  const app = spawn(process.execPath, [fileURLToPath(import.meta.url), '--serve', String(port)], { env, stdio: ['ignore', 'pipe', 'inherit'] });
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('the app did not start in 2 minutes')), 120_000);
    app.stdout.on('data', (b) => { const m = String(b).match(/up: (\S+)/); if (m) { clearTimeout(timer); resolve(m[1]); } });
    app.on('exit', (code) => reject(new Error(`the app quit with ${code}`)));
  });
  const { chromium } = playwright();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.addInitScript(() => localStorage.setItem('zero.firstRun.done', '1'));
    const step = async (label, key, wait) => { log({ step: label }); if (key) await page.keyboard.press(key); await page.waitForTimeout(wait); };
    await page.goto(url);
    await step('loaded', null, 6000);
    for (let i = 0; i < 6; i += 1) await step('J', 'j', 400);
    await step('open a thread', 'Enter', 1500);
    await step('back', 'Escape', 1500);
    for (let i = 0; i < 5; i += 1) await step('E', 'e', 2000);
    await step('Z', 'z', 2000);
    await step('open a thread', 'Enter', 1500);
    await step('back', 'Escape', 1500);
    await step('board', 'b', 2000);
    await step('list', 'b', 2000);
    await step('idle', null, 30_000);
  } finally {
    await browser.close();
    app.kill();
  }
  report(fs.readFileSync(timings, 'utf8').trim().split('\n').map((l) => JSON.parse(l)));
}

function report(lines) {
  const by = new Map();
  for (const l of lines) if (l.channel) { const c = by.get(l.channel) ?? { n: 0, sum: 0, max: 0 }; c.n += 1; c.sum += l.ms; c.max = Math.max(c.max, l.ms); by.set(l.channel, c); }
  console.log('\nRequests from the window, synchronous ms (calls, average, longest), longest first:');
  for (const [ch, c] of [...by].sort((a, b) => b[1].max - a[1].max).slice(0, 15)) console.log(`  ${ch.padEnd(34)} ${String(c.n).padStart(4)} ${String(Math.round(c.sum / c.n)).padStart(6)} ${String(c.max).padStart(6)}`);
  const ticks = lines.filter((l) => l.tick != null).map((l) => l.tick);
  if (ticks.length) console.log(`\nAgents' clock: ${ticks.length} ticks, average ${Math.round(ticks.reduce((a, b) => a + b, 0) / ticks.length)} ms, longest ${Math.max(...ticks)} ms`);
  console.log(`Longest stall in any 5 s: ${Math.max(0, ...lines.filter((l) => l.loopMax != null).map((l) => l.loopMax))} ms`);
  const gcs = lines.filter((l) => l.gc != null);
  const majors = gcs.filter((l) => l.major);
  console.log(`Garbage collections: ${gcs.length}, ${Math.round(gcs.reduce((a, l) => a + l.gc, 0))} ms in all; ${majors.length} full, ${Math.round(majors.reduce((a, l) => a + l.gc, 0))} ms`);
  const freezes = lines.filter((l) => l.freeze);
  console.log(`\nFreezes of 200 ms or more: ${freezes.length}`);
  let last = null;
  for (const l of lines) {
    if (l.step) last = l.step;
    if (l.freeze) console.log(`  ${String(l.freeze.ms).padStart(5)} ms after "${last ?? 'start'}": ${l.freeze.where}`);
  }
  console.log(`\nStacks: ${path.join(data, 'memory-log')}`);
}
