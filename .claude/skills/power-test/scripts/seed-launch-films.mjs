// A Launch project with films and pictures an agent named on threads, so Files
// has sizes, versions and old files for a tester to free space with.
//   AGENTBOX_HOME=<copy>/store node seed-launch-films.mjs <copy folder> [--old <days>]
// power-test.mjs --seed "<this file> --old 40" runs it for every copy. Films
// are short real clips padded with zeros to their size, so they take no disk.
// --old moves the films' and one picture's threads back that many days, so a
// plan that keeps files takes them off the computer on its first pass.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const instance = process.argv[2];
const oldAt = process.argv.indexOf('--old');
const oldDays = oldAt > 0 ? Number(process.argv[oldAt + 1]) : 0;
if (!instance) throw new Error('usage: seed-launch-films.mjs <copy folder> [--old <days>]');
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const accounts = path.join(instance, 'store', 'accounts');
const accountId = fs.readdirSync(accounts).find((d) => fs.statSync(path.join(accounts, d)).isDirectory());
const accountRoot = path.join(accounts, accountId);
const dir = path.join(accountRoot, 'launch');
fs.mkdirSync(path.join(dir, 'designs'), { recursive: true });
if (!fs.existsSync(path.join(dir, 'project.json'))) fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'launch', name: 'Launch' }));

const MB = 1024 * 1024;
const cards = [
  { name: 'hero-dark.png', words: 'Every agent,<br>in one place.', bg: '#0e0d12', glow: '#b9a8ff', ink: '#fff', size: 2.1 * MB },
  { name: 'hero-light.png', words: 'Every agent,<br>in one place.', bg: '#f1efea', glow: '#c9c6bf', ink: '#111', size: 1.8 * MB },
  { name: 'pricing-page.png', words: 'Pro · Plus · Max', bg: '#0d1424', glow: '#f3d28a', ink: '#fff', size: 1.4 * MB },
  { name: 'app-icon.png', words: '', bg: '#1a1614', glow: '#f2c9a8', ink: '#fff', size: 180 * 1024 },
  { name: 'launch-film.png', words: 'Your agents,<br>one inbox.', bg: '#141012', glow: '#f0b9a0', ink: '#fff' },
  { name: 'demo-cut-30s.png', words: 'Thirty seconds<br>of Agentbox.', bg: '#121212', glow: '#e9e1d4', ink: '#fff' },
  { name: 'onboarding-walkthrough.png', words: 'Your first<br>thread.', bg: '#0f1514', glow: '#9fe3d4', ink: '#fff' },
];
const tmp = fs.mkdtempSync('/tmp/seed-');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
for (const c of cards) {
  await page.setContent(`<body style="margin:0;width:1600px;height:1000px;background:radial-gradient(circle at 62% 38%, ${c.glow} 0, transparent 46%), ${c.bg};font-family:Inter,Helvetica,Arial,sans-serif;display:flex;align-items:center;padding-left:110px;box-sizing:border-box"><div style="font-size:128px;line-height:1.02;font-weight:700;letter-spacing:-3px;color:${c.ink}">${c.words}</div></body>`);
  await page.screenshot({ path: path.join(tmp, c.name) });
}
await browser.close();

const pad = (file, size) => fs.truncateSync(file, Math.max(fs.statSync(file).size, Math.round(size)));
for (const c of cards.filter((x) => x.size)) {
  fs.copyFileSync(path.join(tmp, c.name), path.join(dir, 'designs', c.name));
  pad(path.join(dir, 'designs', c.name), c.size);
}
const film = (poster, out, mb, n) => {
  const to = path.join(dir, 'designs', out);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-i', path.join(tmp, poster), '-t', '8', '-r', '24', '-vf', `scale=1280:-2,drawtext=text='cut ${n}':x=40:y=h-80:fontsize=28:fontcolor=white@0.35`, '-pix_fmt', 'yuv420p', '-movflags', '+faststart', to]);
  pad(to, mb * MB);
  return out;
};
const launch = [film('launch-film.png', 'launch-film.mp4', 612, 1), film('launch-film.png', 'launch-film-v2.mp4', 618, 2), film('launch-film.png', 'launch-film-v3.mp4', 624, 3), film('launch-film.png', 'launch-film-final.mp4', 625, 4)];
const demo = [film('demo-cut-30s.png', 'demo-cut-30s.mp4', 544, 1), film('demo-cut-30s.png', 'demo-cut-30s-v2.mp4', 544.4, 2)];
const onboarding = [film('onboarding-walkthrough.png', 'onboarding-walkthrough.mp4', 532, 1)];
fs.writeFileSync(path.join(dir, 'designs', 'launch-plan.md'), `# Launch plan\n\n## Week one\n\nFilm goes out Tuesday on X and LinkedIn.\n\n- Post the 30 second cut first\n- Then the full film\n\n${'Notes for the week. '.repeat(180)}\n`);
fs.writeFileSync(path.join(dir, 'designs', 'press-release.md'), `# Agentbox opens to everyone\n\nToday Agentbox opens its inbox for AI agents to every Mac.\n\nIt runs Claude Code and Codex side by side, one thread per task.\n${'More words. '.repeat(220)}\n`);
fs.rmSync(tmp, { recursive: true, force: true });

const { Store } = await import(path.join(REPO, 'main', 'store.mts'));
const disk = await import(path.join(REPO, 'main', 'store', 'work-items.mts'));
const store = await new Store({ storeRoot: path.join(instance, 'store'), accountId, accountRoot, products: [] }).init();
const named = (files) => files.map((f) => `[${f}](designs/${f})`).join('\n');
const thread = async (title, ...notes) => {
  const t = store.composeItem('launch', { title, body: title });
  for (const note of notes) await disk.updateWorkItem(dir, t.id, { note }, { source: 'agent' });
  return t;
};
await thread('Make the launch film', ...launch.map((f) => `New cut: ${named([f])}`));
await thread('Cut a 30 second demo', ...demo.map((f) => `Here it is: ${named([f])}`));
await thread('Onboarding walkthrough', `The walkthrough: ${named(onboarding)}`);
await thread('Dark hero', `The dark one: ${named(['hero-dark.png'])}`);
await thread('Light hero', `The light one: ${named(['hero-light.png'])}`);
await thread('Pricing page and icon', `${named(['pricing-page.png'])}\n${named(['app-icon.png'])}`);
await thread('Launch plan and press release', named(['launch-plan.md', 'press-release.md']));
// The store writes its lines a moment after it is asked.
await new Promise((r) => setTimeout(r, 4000));
await store.close?.();
if (oldDays) {
  const old = Date.now() - oldDays * 86_400_000;
  const oldTitles = new Set(['Cut a 30 second demo', 'Onboarding walkthrough', 'Light hero']);
  const ids = new Set(store.listAllWorkItems().filter((i) => i.product === 'launch' && oldTitles.has(i.title)).map((i) => i.id));
  const home = path.join(instance, 'store', 'projects');
  for (const name of fs.readdirSync(home).filter((n) => n.endsWith('launch'))) {
    for (const file of fs.readdirSync(path.join(home, name)).filter((f) => f.endsWith('.jsonl'))) {
      const at = path.join(home, name, file);
      const lines = fs.readFileSync(at, 'utf8').split('\n').map((l) => {
        if (!l) return l;
        const row = JSON.parse(l);
        return JSON.stringify(ids.has(row.id) ? { ...row, ts: old + (row.ts % 100000) } : row);
      });
      fs.writeFileSync(at, lines.join('\n'));
    }
  }
}
console.log(JSON.stringify({ dir, threads: store.listAllWorkItems().filter((i) => i.product === 'launch').length }));
