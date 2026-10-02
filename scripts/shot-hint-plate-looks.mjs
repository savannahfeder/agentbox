// THE HOVER HINT UNDER EVERY LOOK (w-517f37356a). Points a real mouse at an
// inbox row and at a sidebar tab, waits for the hint plate, then reads the
// plate's own computed colours and photographs it. Run from the repo root as
//   arch -arm64 node scripts/shot-hint-plate-looks.mjs <dist> <outDir>
import fs from 'node:fs';
import path from 'node:path';
import { openInbox } from './lib/inbox-harness.mjs';

const [dist = 'renderer/dist', out = '/tmp/hint-looks'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });

const now = Date.now();
const item = (n, title) => ({
  id: `w-aaaaaa0${n}`, title, body: `${title} Pick one.`, status: 'open', kind: 'question',
  labels: [], priority: 2, createdAt: now - n * 60_000, updatedAt: now - n * 60_000,
  wrote: {}, product: 'agentbox', productName: 'Agentbox',
});
const snapshot = {
  products: [{ slug: 'agentbox', name: 'Agentbox' }],
  items: [
    item(1, 'The landing page headline needs a pick.'),
    item(2, 'The sidebar icons are ready to look at.'),
    item(3, 'The privacy page wording is drafted.'),
    item(4, 'The idle screen clock is built.'),
  ],
  approvals: [],
  supervisor: { paused: false, pausedProducts: [], running: [], stalled: [], queued: [], scheduled: [], productOrder: ['agentbox'], hiddenProducts: [], personalProducts: [], capacity: 0 },
  restartNeeded: null,
  config: {},
};

const LOOKS = [
  { name: 'light', theme: 'light', skin: 'none' },
  { name: 'frost-haze', theme: 'light', skin: 'frost-haze' },
  { name: 'slate-haze', theme: 'light', skin: 'slate-haze' },
  { name: 'peach-haze', theme: 'light', skin: 'peach-haze-2' },
  { name: 'dark', theme: 'dark', skin: 'none' },
  { name: 'valley-haze', theme: 'dark', skin: 'valley-haze' },
];
const TARGETS = [
  { name: 'row', sel: '[data-hint="row"]' },
  // The Inbox page's own tabs, which wear the Tab plate since w-914b16eab6.
  { name: 'tab', sel: '.tm-tab[data-hint]' },
];

const h = await openInbox({ dist, snapshot });
const report = [];
try {
  for (const look of LOOKS) {
    await h.goto(h.origin);
    await h.evaluate(`localStorage.setItem('zero.firstRun.done', '1')`);
    await h.wear({ theme: look.theme, skin: look.skin });
    for (const t of TARGETS) {
      const box = await h.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(t.sel)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + Math.min(r.width / 2, 120), y: r.top + r.height / 2 }; })()`);
      if (!box) { report.push({ look: look.name, target: t.name, missing: true }); continue; }
      await h.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: h.height - 5 });
      await h.wait(300);
      await h.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
      await h.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x + 1, y: box.y });
      let plate = null;
      for (let i = 0; i < 30 && !plate; i++) {
        await h.wait(200);
        plate = await h.evaluate(`(() => {
          const p = document.querySelector('.hint-plate');
          if (!p || getComputedStyle(p).visibility === 'hidden') return null;
          const r = p.getBoundingClientRect();
          const cs = (el) => { const s = getComputedStyle(el); return { color: s.color, bg: s.backgroundColor, border: s.borderTopColor }; };
          return { x: r.left, y: r.top, w: r.width, h: r.height, plate: cs(p), kbd: cs(p.querySelector('kbd')), what: cs(p.querySelector('.hint-what')), look: document.documentElement.dataset.theme + '/' + (document.documentElement.dataset.skin || '') };
        })()`);
      }
      if (!plate) { report.push({ look: look.name, target: t.name, noPlate: true }); continue; }
      const pad = 40;
      const clip = { x: Math.max(0, plate.x - pad), y: Math.max(0, plate.y - pad), width: plate.w + pad * 2, height: plate.h + pad * 2, scale: 2 };
      const { data } = await h.call('Page.captureScreenshot', { format: 'png', clip });
      const file = path.join(out, `${look.name}-${t.name}.png`);
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
      report.push({ look: look.name, target: t.name, file, ...plate });
    }
  }
} finally {
  h.close();
}
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.map(({ look, target, plate, kbd, what, missing, noPlate }) => ({ look, target, missing, noPlate, plate, kbd: kbd?.color, kbdLine: kbd?.border, what: what?.color })), null, 1));
