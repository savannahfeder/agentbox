// THE REPLY BOX'S SENTENCE, photographed in the built renderer (w-86dd93ab0d).
//
//   arch -arm64 node scripts/shot-reply-sentence.mjs <outDir>
//
// Opens a fixture row, opens its reply box, and clips the card in dark and
// light. Nothing is injected; it reads what the built code draws.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openInbox } from './lib/inbox-harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = process.argv[2] ?? '/tmp/w-86dd93ab0d-shots';
fs.mkdirSync(outDir, { recursive: true });
const NEEDLE = process.env.NEEDLE ?? 'build menu has never started';

const h = await openInbox({ dist: path.join(root, 'renderer', 'dist'), width: 1200, height: 817, snapshot: { products: [], items: [] } });

async function clip(name, sel, pad = 8) {
  const box = await h.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null;
    const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
  if (!box) { console.log(`${name}: MISSING ${sel}`); return; }
  const { data } = await h.call('Page.captureScreenshot', { format: 'png',
    clip: { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.w + pad * 2, height: box.h + pad * 2, scale: 2 } });
  fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
}

for (const theme of ['dark', 'light']) {
  await h.goto(`${h.origin}/?fixtures=1`);
  await h.evaluate(`localStorage.setItem('zero.theme', ${JSON.stringify(theme)}); localStorage.setItem('zero.firstRun.done', '1')`);
  await h.goto(`${h.origin}/?fixtures=1`);
  await h.wait(800);
  console.log(theme, await h.evaluate(`(() => { const rows = [...document.querySelectorAll('.row, .item, li, [class*="row"]')];
    const hit = rows.find((r) => (r.textContent || '').includes(${JSON.stringify(NEEDLE)})); if (!hit) return 'NOT FOUND'; hit.click(); return 'opened'; })()`));
  await h.wait(800);
  await h.evaluate(`(document.querySelector('.dock-pill') || {click(){}}).click()`);
  await h.wait(500);
  // The clauses fade until pointed at; hover the sentence so they show.
  const at = await h.evaluate(`(() => { const el = document.querySelector('.compose-sentence'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
  if (at) await h.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
  await h.wait(600);
  console.log(theme, await h.evaluate(`(document.querySelector('.compose-sentence') || {}).innerText`));
  await clip(`reply-${theme}`, '.dock-card');
}
h.close();
