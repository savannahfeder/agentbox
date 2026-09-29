// THE LINE UNDER HER TITLE, BEFORE AND AFTER w-299ee43d2e.
//
// Draws one opened task carrying code figures in the built renderer, headless,
// then draws it again with the old rule forced back on, and measures where the
// title, the byline words, the figures and the corner marks land in each.
//
//   arch -arm64 node scripts/shot-w-299ee43d2e.mjs <outDir>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openInbox } from './lib/inbox-harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = process.argv[2] ?? '/tmp/shots-w-299ee43d2e';
fs.mkdirSync(outDir, { recursive: true });

const now = Date.now();
const item = {
  id: 'w-5a1e0c0de0', product: 'north-sound', productName: 'North Sound',
  title: "We're introducing a lot of new features, and I want to make sure the quality of the outputs of our videos remains the same",
  body: "We're introducing a lot of new features, and I want to make sure the quality of the outputs of our videos remains the same.",
  result: '**The video skills are now pinned on main. A weekly check will ask you only when HeyGen has an update.**\n\nThe short version: run `git pull`, then `pnpm evals gate`. It plays the customer paths on your Mac and prints PASS or FAIL.',
  status: 'open', kind: 'directive', labels: ['founder'], priority: 5,
  createdAt: now - 5 * 3600e3, updatedAt: now - 3600e3,
  wrote: { title: { ts: now - 5 * 3600e3, source: 'founder' }, body: { ts: now - 5 * 3600e3, source: 'founder' }, result: { ts: now - 3600e3, source: 'agent' } },
};
const snapshot = {
  products: [{ slug: 'north-sound', name: 'North Sound', dir: '/tmp/north-sound', oneLiner: '', repoPath: null }],
  items: [item], agents: [], approvals: [],
  supervisor: { paused: false, pausedProducts: [], running: [], stalled: [], queued: [], scheduled: [], productOrder: ['north-sound'], hiddenProducts: [], personalProducts: [], capacity: 0 },
  restartNeeded: null, config: { browserHome: '', browserPins: [], outsideAgents: 'all' },
};
const change = { files: [{ path: 'evals/gate.json' }, { path: 'scripts/evals.mjs' }], plus: 6, minus: 5, editCount: 3 };

const W = 1736, H = 1123;
const h = await openInbox({ dist: path.join(root, 'renderer', 'dist'), width: W, height: H, snapshot });
await h.call('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    localStorage.setItem('zero.firstRun.done', '1');
    window.zero.codeChange = async () => ({ ok: true, change: ${JSON.stringify(change)} });
    window.zero.sessionTrace = async () => ({ ok: true, sessions: [] });
    window.zero.itemHistory = async () => ({ ok: true, lines: ${JSON.stringify([
      { id: item.id, ts: item.createdAt, source: 'founder', title: item.title, body: item.body, status: 'open', kind: item.kind },
      { id: item.id, ts: item.updatedAt, source: 'agent', patch: { result: item.result } },
    ])} });
    window.zero.compactionStatus = async () => null;
    window.zero.artifacts = async () => ({ artifacts: [], memories: [] });
    window.zero.settings = async () => ({ ok: false, workspace: null, projects: [] });
    window.zero.badge = () => {}; window.zero.notify = () => {};
  `,
});

const OLD = `.workspace-layout.workspace-task .workspace-task-header .keep-line > .focus-meta { margin-top: 15px !important; }
.workspace-layout.workspace-task .workspace-task-header .keep-line > .focus-meta > .change-figures { transform: none !important; }`;

async function shoot(name, css, skin = 'ember-grid', theme = 'dark') {
  await h.wear({ theme, skin });
  const opened = await h.evaluate(`(async () => {
    const r = [...document.querySelectorAll('.row')].find((x) => /introducing a lot/.test(x.innerText));
    if (!r) return false; r.click(); await new Promise((z) => setTimeout(z, 1200)); return true;
  })()`);
  if (!opened) throw new Error('the task row is not in the inbox: ' + await h.evaluate('document.body.innerText.slice(0, 300)'));
  if (css) await h.evaluate(`(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(css)}; document.head.appendChild(s); })()`);
  await h.wait(500);
  const m = await h.evaluate(`(() => {
    const box = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), left: +r.left.toFixed(1), right: +r.right.toFixed(1) }; };
    return {
      layout: document.querySelector('.workspace-layout')?.className ?? null,
      title: box('.workspace-task-header .keep-line-title'),
      words: box('.workspace-task-header .focus-meta .fm-said') ?? box('.workspace-task-header .focus-meta'),
      figures: box('.workspace-task-header .change-figures'),
      corner: box('.workspace-layout.workspace-task > .topbar > .topbar-right'),
      err: window.__ERR__ ?? null,
    };
  })()`);
  await h.capture(path.join(outDir, `${name}.png`));
  console.log(name, JSON.stringify(m));
}

try {
  await shoot('ember-grid-before', OLD);
  await shoot('ember-grid-after', null);
  await shoot('valley-haze-after', null, 'valley-haze');
  await shoot('lake-after', null, 'lake');
  await shoot('frost-haze-after', null, 'frost-haze', 'light');
} finally {
  h.close();
}
