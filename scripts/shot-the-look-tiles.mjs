// THE THEME TILES ON THE WALK'S LOOK SCREEN, retaken off today's app
// (w-ec62ab6b38). The tiles in renderer/src/assets/look-tiles were photographs
// of the old layout, the top tab strip and the project rail, and the themes
// added since (Ember Grid, Orbital Glass, the hazes) had no tile at all, so the
// default drew as a blank black square. This photographs the real renderer once
// per look, the whole window at 1376x896, and writes each one at 344x224, the
// tile's own size at 2x.
//
//   npx vite build renderer --outDir dist-fr
//   arch -arm64 node scripts/shot-the-look-tiles.mjs [outDir]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openInbox } from './lib/inbox-harness.mjs';

// `SKINS` in renderer/src/skins.ts, read by hand because plain node cannot
// import a .ts file. `light` marks the ones that wear the light theme.
const SKINS = [
  { id: 'valley-haze' }, { id: 'frost-haze', light: true }, { id: 'slate-haze', light: true },
  { id: 'lake' }, { id: 'ice' }, { id: 'pixel-ridge' }, { id: 'peach-haze-2', light: true },
  { id: 'orbital-glass' }, { id: 'pixel-orbit' }, { id: 'woodblock-sea' }, { id: 'riso-hills' },
  { id: 'gouache-valley' }, { id: 'watercolour-mist' }, { id: 'ember-grid' },
];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = process.argv[2] ?? path.join(root, 'renderer/src/assets/look-tiles');
const scratch = fs.mkdtempSync('/tmp/look-tiles-');
fs.mkdirSync(outDir, { recursive: true });

const now = Date.now();
const rows = [
  ['Added the sign-in route. Tests green.', 'I reused the session cookie rather than tokens. Say if you disagree.', 'Practice'],
  ['Fixed the flaky checkout test.', 'It was a race on the fixture. It awaits now. Nothing else changed.', 'Practice'],
  ['Moved the pricing page onto the new layout.', 'Screens match the design at all three widths. Ready to merge.', 'Storefront'],
  ['Which push provider should the app use?', 'Two work. One is free up to ten thousand devices.', 'Mobile'],
  ['Wrote the migration guide for version two.', 'Every renamed option has an example.', 'Docs'],
  ['Upgraded the database driver.', 'All 412 tests pass. Connection time is down by a third.', 'Storefront'],
];
const snapshot = {
  products: ['Practice', 'Storefront', 'Mobile', 'Docs'].map((name) => ({ slug: name.toLowerCase(), name })),
  items: rows.map(([title, body, project], i) => {
    const at = now - (i + 1) * 7 * 60_000;
    return {
      id: `w-tile${i}`, product: project.toLowerCase(), productName: project, kind: 'question', status: 'open',
      title, body, createdAt: at, updatedAt: at,
      wrote: { title: { ts: at, source: 'agent' }, body: { ts: at, source: 'agent' } },
    };
  }),
  agents: [], approvals: [],
  supervisor: { paused: false, pausedProducts: [], running: [], stalled: [], queued: [], scheduled: [], productOrder: [], hiddenProducts: [], personalProducts: [], capacity: 4 },
  restartNeeded: null, config: {},
};

const looks = [
  ...SKINS.map((s) => ({ id: s.id, theme: s.light ? 'light' : 'dark', skin: s.id })),
  { id: 'dark', theme: 'dark', skin: 'none' },
  { id: 'light', theme: 'light', skin: 'none' },
];

const W = 1376, H = 896;
const app = await openInbox({ dist: 'renderer/dist-fr', width: W, height: H, snapshot });
const { evaluate, wait, goto, origin, capture } = app;
for (const l of looks) {
  await goto(origin);
  await evaluate(`localStorage.clear(); localStorage.setItem('zero.firstRun.done', '1');
    localStorage.setItem('zero.deliveredThrough', '1');
    localStorage.setItem('zero.theme', ${JSON.stringify(l.theme)});
    localStorage.setItem('zero.skin', ${JSON.stringify(l.skin)});`);
  await goto(origin);
  await evaluate(`(async () => { await document.fonts.ready; })()`);
  await wait(1600);
  const rowsDrawn = await evaluate(`document.querySelectorAll('.list-pane .row').length`);
  const png = path.join(scratch, `${l.id}.png`);
  await capture(png);
  const webp = path.join(outDir, `${l.id}.webp`);
  execFileSync('cwebp', ['-quiet', '-q', '86', '-resize', '344', '224', png, '-o', webp]);
  console.log(l.id.padEnd(18), 'rows', rowsDrawn, '->', path.relative(root, webp));
}
console.log('errors:', await evaluate('window.__ERR__ ?? null'));
app.close();
