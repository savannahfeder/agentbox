// WHAT ONE AGENT'S UPDATE COSTS THE WINDOW, AND WHAT IT DOES TO THE FRAMES.
//
//   node scripts/run.mjs scripts/measure-speed.mjs --fresh --threads 200 --stranded 400 --idle 1
//   node scripts/run.mjs scripts/measure-window.mjs [--seconds 20] [--every 400] [--click Inbox] [--scroll] [--open] [--out profile.json]
//
// Runs on the made-up inbox scripts/measure-speed.mjs leaves in the temp
// folder, so run that with --fresh first. Tells the window something changed
// every 400 ms, as one writing agent does, and prints how busy the window's
// main thread was, what each update cost, the frames that came late, and the
// functions the time went to. Build the window with
// `npx vite build renderer --minify false` to read their names.
//
// --every 0 sends no updates: the quiet window, to compare against.
// --click Inbox goes to a page by its name in the sidebar first.
// --scroll turns the wheel the whole time, down three seconds and up three.
// --open opens the first thread first.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
const seconds = Number(flag('seconds', 20));
const every = Number(flag('every', 400));
if (every !== 0 && every !== 400) throw new Error('--every is 400 (one writing agent) or 0 (none)');
const root = path.join(os.tmpdir(), 'agentbox-speed');
if (!fs.existsSync(path.join(root, 'data', 'zero.config.json'))) throw new Error('No made-up inbox: run scripts/measure-speed.mjs --fresh first.');
const port = 4900 + Math.floor(Math.random() * 90);
const env = { PATH: process.env.PATH, TMPDIR: os.tmpdir(), NODE_OPTIONS: process.env.NODE_OPTIONS ?? '', HOME: path.join(root, 'home'), AGENTBOX_FRESH_USER: '1' };
const app = spawn(process.execPath, [path.join(repo, 'scripts', 'measure-speed.mjs'), '--serve', String(port), ...(every ? ['--streaming'] : [])], { env, stdio: ['ignore', 'pipe', 'inherit'], detached: true });
const stop = () => { try { process.kill(-app.pid, 'SIGKILL'); } catch { /* already gone */ } };
const url = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('the app did not start in 2 minutes')), 120_000);
  app.stdout.on('data', (b) => { const m = String(b).match(/up: (\S+)/); if (m) { clearTimeout(timer); resolve(m[1]); } });
  app.on('exit', (code) => reject(new Error(`the app quit with ${code}`)));
});
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
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
  const metrics = async () => {
    const { metrics: m } = await cdp.send('Performance.getMetrics');
    const of = (name) => m.find((x) => x.name === name)?.value ?? 0;
    return { task: of('TaskDuration'), script: of('ScriptDuration'), layout: of('LayoutDuration'), style: of('RecalcStyleDuration'), heap: of('JSHeapUsedSize'), nodes: of('Nodes'), listeners: of('JSEventListeners') };
  };
  await page.goto(url);
  await page.waitForTimeout(8000);
  if (flag('click', null)) { await page.getByText(flag('click'), { exact: true }).first().click(); await page.waitForTimeout(3000); }
  if (args.includes('--open')) { await page.keyboard.press('j'); await page.keyboard.press('Enter'); await page.waitForTimeout(3000); }
  await page.evaluate(() => { window.__frames = []; window.__long = []; });
  const before = await metrics();
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
  await cdp.send('Profiler.start');
  const t0 = Date.now();
  if (args.includes('--scroll')) {
    await page.mouse.move(700, 500);
    while (Date.now() - t0 < seconds * 1000) {
      const down = Math.floor((Date.now() - t0) / 3000) % 2 === 0;
      await page.mouse.wheel(0, down ? 120 : -120);
      await page.waitForTimeout(50);
    }
  } else {
    await page.waitForTimeout(seconds * 1000);
  }
  const { profile } = await cdp.send('Profiler.stop');
  const took = (Date.now() - t0) / 1000;
  const after = await metrics();
  const seen = await page.evaluate(() => ({ frames: window.__frames, long: window.__long }));

  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  profile.samples.forEach((id, i) => self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0)));
  const nameOf = (n) => `${n.callFrame.functionName || '(anonymous)'} ${path.basename(n.callFrame.url || '')}:${n.callFrame.lineNumber + 1}`;
  const flat = new Map();
  let busy = 0;
  for (const [id, us] of self) {
    const n = byId.get(id);
    if (n.callFrame.functionName === '(idle)') continue;
    busy += us;
    flat.set(nameOf(n), (flat.get(nameOf(n)) ?? 0) + us);
  }
  // Time under the top component, counted once however deep it nests.
  const sub = (n) => (self.get(n.id) ?? 0) + (n.children ?? []).reduce((a, c) => a + sub(byId.get(c)), 0);
  let underApp = 0;
  const walk = (n) => { if (n.callFrame.functionName === 'App') { underApp += sub(n); return; } for (const c of n.children ?? []) walk(byId.get(c)); };
  walk(profile.nodes[0]);

  const ms = (us) => Math.round(us / 1000);
  const share = (a, b) => Math.round(((a - b) / took) * 100);
  const pushes = every ? Math.round((took * 1000) / every) : 0;
  const f = seen.frames;
  const over = (n) => f.filter((x) => x > n).length;
  const where = `${flag('click', 'the first page')}${args.includes('--open') ? ', a thread open' : ''}${args.includes('--scroll') ? ', scrolling' : ''}`;
  console.log(`The window over ${took.toFixed(1)} s on ${where}, ${pushes ? `${pushes} updates` : 'no updates'}`);
  console.log(`  main thread busy ${share(after.task, before.task)}% of the time (script ${share(after.script, before.script)}%, layout ${share(after.layout, before.layout)}%, style ${share(after.style, before.style)}%)`);
  if (pushes) console.log(`  each update: ${Math.round(((after.task - before.task) * 1000) / pushes)} ms of main thread, the quiet window's share included`);
  console.log(`  frames: ${Math.round(f.length / took)} a second; late by over 20 ms ${over(20)}, over 50 ms ${over(50)}, over 100 ms ${over(100)}; worst ${Math.round(Math.max(0, ...f))} ms`);
  console.log(`  tasks of 50 ms or more: ${seen.long.length}, longest ${Math.max(0, ...seen.long)} ms`);
  console.log(`  ${Math.round(after.heap / 1048576)} MB of heap, ${after.nodes} elements, ${after.listeners} listeners`);
  console.log(`  under the top component (App): ${ms(underApp)} ms, ${Math.round((underApp / busy) * 100)}% of the busy time`);
  console.log('  where the time went, top 30:');
  for (const [k, us] of [...flat].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`    ${String(ms(us)).padStart(6)} ms  ${String(Math.round((us / busy) * 100)).padStart(3)}%  ${k}`);
  if (flag('out', null)) fs.writeFileSync(flag('out'), JSON.stringify(profile));
} finally {
  await browser.close();
  stop();
}
