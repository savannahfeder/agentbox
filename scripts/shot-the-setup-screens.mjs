// THE SCREENS BEFORE THE TUTORIAL, one picture each, off the built renderer in
// headless Chrome (w-ec62ab6b38). Opens each with `?firstrun=<step>` on an empty
// store, the way a brand new Mac sees them, with nothing stored about the look
// except what the app seeds itself.
//
//   npx vite build renderer --outDir dist-fr
//   arch -arm64 node scripts/shot-the-setup-screens.mjs <outDir> [W] [H]
import fs from 'node:fs';
import path from 'node:path';
import { openInbox } from './lib/inbox-harness.mjs';

const outDir = process.argv[2] ?? '/tmp/setup-screens';
const W = Number(process.argv[3] ?? 1440), H = Number(process.argv[4] ?? 900);
fs.mkdirSync(outDir, { recursive: true });

const snapshot = {
  products: [], items: [], agents: [], approvals: [],
  supervisor: { paused: false, pausedProducts: [], running: [], stalled: [], queued: [], scheduled: [], productOrder: [], hiddenProducts: [], personalProducts: [], capacity: 4 },
  restartNeeded: null, config: {},
};

const app = await openInbox({ dist: 'renderer/dist-fr', width: W, height: H, snapshot });
const { call, evaluate, wait, goto, origin, capture } = app;

// A MAC THAT ALREADY RUNS AGENTS. The folder screen lists the folders recent
// Claude Code and Codex conversations ran in; headless Chrome has none, so a
// few invented ones stand in. NOBODY=1 shoots the screen a Mac with none sees.
const now = Date.now();
const threads = process.env.NOBODY === '1' ? [] : [
  ['/Users/you/code/storefront', '~/code/storefront', 'terminal', 12],
  ['/Users/you/code/mobile-app', '~/code/mobile-app', 'codex', 40],
  ['/Users/you/code/storefront', '~/code/storefront', 'codex', 55],
  ['/Users/you/code/docs-site', '~/code/docs-site', 'terminal', 180],
  ['/Users/you/work/billing-api', '~/work/billing-api', 'desktop', 1440],
].map(([folder, short, source, minsAgo], i) => ({
  id: `t${i}`, source, folder, folderName: folder.split('/').pop(), short,
  title: 'x', when: now - minsAgo * 60_000, path: `/tmp/t${i}.jsonl`,
}));
await call('Page.addScriptToEvaluateOnNewDocument', {
  source: `window.zero.agentThreads = async () => ({ threads: ${JSON.stringify(threads)} });`,
});
const steps = ['welcome', 'folder', 'name', 'inbox', 'away', 'goal', 'look'];
for (const [i, step] of steps.entries()) {
  await goto(origin);
  await evaluate('localStorage.clear()');
  await goto(`${origin}/?firstrun=${step}`);
  await evaluate(`(async () => { await document.fonts.ready; })()`);
  await wait(1800);
  const file = path.join(outDir, `${String(i + 1).padStart(2, '0')}-${step}.png`);
  await capture(file);
  console.log(step.padEnd(8), await evaluate(`document.documentElement.dataset.skin ?? 'none'`), '|',
    (await evaluate(`(document.querySelector('.fr-screen')?.innerText ?? '').replace(/\\s+/g, ' ').slice(0, 140)`)));
}
// THE NAME SCREEN AS SOMEBODY REACHES IT: open the folder screen and click the
// first folder in the list, which is what moves on now.
await goto(origin);
await evaluate('localStorage.clear()');
await goto(`${origin}/?firstrun=folder`);
await wait(2000);
const clicked = await evaluate(`(() => { const b = document.querySelector('.fr-folder'); if (b) b.click(); return b ? b.innerText.replace(/\\s+/g, ' ') : null; })()`);
await wait(900);
await capture(path.join(outDir, '03b-name-after-a-click.png'));
console.log('clicked :', clicked, '|', await evaluate(`(document.querySelector('.fr-screen')?.innerText ?? '').replace(/\\s+/g, ' ').slice(0, 140)`));
console.log('errors  :', await evaluate('window.__ERR__ ?? null'));
app.close();
