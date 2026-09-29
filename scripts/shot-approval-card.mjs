// THE APPROVAL CARD, photographed in the built renderer (w-34b7b861b6).
//
//   arch -arm64 node scripts/shot-approval-card.mjs <outDir> [dist]
//
// Two things are being shown and they are the two she asked about: whether the
// card says WHICH AGENT is asking, and whether it is still a solid slab on a
// themed window. So it shoots the same card on a skin and on plain dark, and
// points `dist` at either build so a before and an after can be laid side by
// side.
//
// Nothing is faked about the card itself. The snapshot is her real store, read
// the way every other shot script reads it, with one approval added pointing at
// a row that is really in it: `item` is a field main/approval-prompt-server.mjs
// has always stamped, so this is the shape a real ask arrives in.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openInbox } from './lib/inbox-harness.mjs';
import { foldWorkItems } from '../shared/work-items.mjs';
import { MACHINERY_PREFIX } from './lib/machine-paths.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = process.argv[2] ?? '/tmp/w-34b7b861b6-shots';
const dist = process.argv[3] ?? path.join(root, 'renderer', 'dist');
fs.mkdirSync(outDir, { recursive: true });

// HER REAL ROWS, OFF THE REAL LEDGER. `herSnapshot` in the shared harness still
// looks for `work-items.jsonl` inside the product folder, which is where it
// stopped being on 2026-08-27; it comes back empty on this machine. The
// ledgers live under `projects/<dashed product path>/` now, so this reads
// there. Nothing is written.
function snapshotOf(slug, name) {
  const file = path.join(`${MACHINERY_PREFIX}${slug}`, 'work-items.jsonl');
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const items = [...foldWorkItems(lines).values()]
    .map((item) => ({ ...item, product: slug, productName: name }));
  return {
    products: [{ slug, name }], items, approvals: [],
    supervisor: {
      paused: false, pausedProducts: [], running: [], stalled: [], queued: [], scheduled: [],
      productOrder: [slug], hiddenProducts: [], personalProducts: [], capacity: 4,
    },
    restartNeeded: null,
    config: {},
  };
}

const snap = snapshotOf('astral', 'Agentbox');
// A row that is really running, so the title on the card is a title she would
// recognise and the click has somewhere to go.
const row = snap.items.find((i) => i.status === 'claimed' && i.title)
  ?? snap.items.find((i) => i.title);
if (!row) throw new Error('no row in her store to hang an approval off');
console.log('hanging the approval off:', row.id, '-', row.title.slice(0, 70));

// TWO CARDS, BECAUSE THE LEDE HAS TWO CASES AND ONLY ONE OF THEM IS THE PRETTY
// ONE. A worker usually sends a description of what its command does, and that
// sentence is the card's heading. Plenty of asks arrive without one, and then
// the heading falls back to "<Product> asks to run", which is what the card
// used to say at the top of every ask. Both have to be photographed or the
// round is only checking the half that flatters it.
const at = Date.now() - 4000;
const SAID = {
  id: 'shot-1',
  at,
  product: row.product,
  item: row.id,
  tool: 'Bash',
  input: {
    command: '/tmp/ab-serve/main/main.mjs',
    description: 'Start the store server so the worker can read the ledger',
    cwd: '/tmp/ab-serve',
  },
};
const BARE = {
  id: 'shot-0',
  at: at - 1,
  product: row.product,
  item: row.id,
  tool: 'Bash',
  input: { command: '/tmp/ab-serve/main/main.mjs', cwd: '/tmp/ab-serve' },
};
const QUEUE = [
  { id: 'shot-2', at: at + 1, product: row.product, item: row.id, tool: 'Bash', input: { command: 'npm test' } },
  { id: 'shot-3', at: at + 2, product: row.product, item: row.id, tool: 'Bash', input: { command: 'git status' } },
];
// The front card is always the oldest (approval-stage.ts), so whichever of the
// two is meant to be photographed goes first.
const CASES = {
  'said': [SAID, ...QUEUE],
  'no-description': [BARE, ...QUEUE],
};

// A PAGE PER CASE, because `window.__SNAP__` is injected by
// `Page.addScriptToEvaluateOnNewDocument` and is therefore rebuilt from the
// ORIGINAL object on every reload. Setting it and navigating looks like it
// works and photographs the first case twice.
async function clip(h, name, sel, pad = 26) {
  const box = await h.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return null; const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
  if (!box) { console.log(`${name}: MISSING ${sel}`); return false; }
  const { data } = await h.call('Page.captureScreenshot', {
    format: 'png',
    clip: {
      x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad),
      width: box.w + pad * 2, height: box.h + pad * 2, scale: 2,
    },
  });
  fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
  console.log(`${name}.png`);
  return true;
}

// THERE IS ONE CARD AGAIN. This looped five header treatments through a
// `data-approval-look` attribute for one design round; she picked Quiet by name
// on 2026-09-24 and the other four were deleted the same session, attribute and
// all. The rejected CSS is in decisions.md under that date. Do not put the loop
// back: the switch was scaffolding for a choice she has now made.
for (const [name, approvals] of Object.entries(CASES)) {
  const h = await openInbox({ dist, width: 1440, height: 944, snapshot: { ...snap, approvals } });
  for (const look of [{ theme: 'dark', skin: 'cel-dusk' }, { theme: 'dark', skin: 'none' }]) {
    await h.wear(look);
    await h.wait(900);
    const err = await h.evaluate('window.__ERR__ || null');
    if (err) console.log('PAGE ERROR:', err);
    // How big the heading really is, printed so the numbers in a write-up are
    // measured rather than remembered, and so a build that lost the pick shows
    // up here rather than in her inbox.
    const head = await h.evaluate(`(() => { const el = document.querySelector('.approval-lede');
      if (!el) return null; const s = getComputedStyle(el);
      return s.fontSize + ' / ' + s.fontWeight; })()`);
    // What the card actually says, so a shot that drew the wrong thing cannot
    // pass as the right one.
    console.log(`\n[${name} / ${look.skin}] heading ${head}\n${await h.evaluate(`(document.querySelector('.approval-card') || {}).innerText`)}`);
    await clip(h, `approval-${name}-${look.skin}`, '.approvals');
  }
  h.close();
}
