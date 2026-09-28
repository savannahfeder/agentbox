// ⌘F in a chat, photographed in the real renderer (w-cc5bc203d0).
//
// The chord itself is caught in the main process, which a headless browser
// does not have, and a second Electron is barred (it would bring her running
// window forward). So the bridge's `onFind` is stubbed to hand its listener
// back, and pressing ⌘F here is calling that listener exactly as main would.
// Everything after that, the box, the typing, Enter, Escape, is the built app.
//
//   arch -arm64 node scripts/shot-command-f-finds.mjs <outDir>
import fs from 'node:fs';
import path from 'node:path';
import { openInbox } from './lib/inbox-harness.mjs';

const outDir = process.argv[2] ?? '/tmp/shot-command-f';
fs.mkdirSync(outDir, { recursive: true });

const T0 = Date.UTC(2026, 8, 25, 14, 0);
const min = (n) => T0 + n * 60_000;
const ID = 'w-f1d0c0ffee';
const lines = [
  { id: ID, ts: min(0), source: 'founder', patch: { title: 'Tighten the landing page copy', body: 'The landing page headline is too long. Cut it to one line and keep the pricing band as it is.', status: 'open', kind: 'directive', product: 'north' } },
  { id: ID, ts: min(9), source: 'agent', patch: { result: 'I cut the headline to one line and left the pricing band alone. The subheader still runs to three lines on a phone.' } },
  { id: ID, ts: min(14), source: 'founder', patch: { answer: 'Good. Make the subheader shorter too, and move the FAQ above the footer on the landing page.' } },
  { id: ID, ts: min(31), source: 'agent', patch: { result: 'The subheader is one line now and the FAQ sits above the footer. Both are on the branch, not on main.' } },
  { id: ID, ts: min(40), source: 'founder', patch: { answer: 'Ship the landing page. Then look at the sidebar spacing, it feels cramped.' } },
  { id: ID, ts: min(58), source: 'agent', patch: { result: 'The landing page is merged to main. The sidebar spacing is the next thing I will look at.' } },
];

const item = {
  id: ID, product: 'north', productName: 'North Sound', status: 'open', kind: 'directive',
  title: 'Tighten the landing page copy', body: lines[0].patch.body,
  result: lines[5].patch.result,
  createdAt: min(0), updatedAt: min(58), priority: 5, labels: ['founder'],
  wrote: { title: { ts: min(0), source: 'founder' }, body: { ts: min(0), source: 'founder' }, result: { ts: min(58), source: 'agent' } },
};
const others = [
  ['w-a11ce00001', 'Sidebar spacing feels cramped on a small screen'],
  ['w-a11ce00002', 'Pick a dark palette for the settings page'],
  ['w-a11ce00003', 'The pricing band needs a yearly option'],
].map(([id, title], i) => ({
  id, product: 'north', productName: 'North Sound', status: 'open', kind: 'question', title,
  body: `**${title}.**`, createdAt: min(-60 * (i + 1)), updatedAt: min(-60 * (i + 1)), priority: 5, labels: [],
  wrote: { title: { ts: min(-60), source: 'agent' }, body: { ts: min(-60), source: 'agent' } },
}));

const snapshot = {
  products: [{ slug: 'north', name: 'North Sound' }],
  items: [item, ...others], approvals: [],
  supervisor: { paused: false, pausedProducts: [], running: [], stalled: [], queued: [], scheduled: [], productOrder: ['north'], hiddenProducts: [], personalProducts: [], capacity: 0 },
  restartNeeded: null, config: {},
};

const inbox = await openInbox({ dist: 'renderer/dist', width: 1280, height: 800, snapshot });
const { call, evaluate, wait, wear, capture } = inbox;
await call('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    localStorage.setItem('zero.firstRun.done', '1');
    window.addEventListener('DOMContentLoaded', () => {});
    const lines = ${JSON.stringify(lines)};
    const patchBridge = () => {
      if (!window.zero || window.zero.__found) return;
      window.zero.__found = true;
      window.zero.itemHistory = async () => ({ ok: true, lines });
      window.zero.onFind = (fn) => { window.__press = fn; return () => {}; };
    };
    patchBridge();
    setTimeout(patchBridge, 0);
  `,
});

const type = async (text) => {
  for (const ch of text) await call('Input.dispatchKeyEvent', { type: 'char', text: ch });
};
const key = (k, code, keyCode, modifiers = 0) => (async () => {
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: keyCode, modifiers });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: keyCode, modifiers });
})();

const state = () => evaluate(`(() => {
  const h = CSS.highlights;
  const cur = h.get('find-current');
  let current = null;
  if (cur) for (const r of cur) current = { text: r.toString(), top: Math.round(r.getBoundingClientRect().top) };
  const bar = document.querySelector('.find-bar');
  return {
    open: !!bar,
    label: bar?.querySelector('.find-count')?.textContent ?? null,
    matches: h.get('find-match')?.size ?? 0,
    current,
    focusInBox: document.activeElement?.classList?.contains('find-input') ?? false,
    err: window.__ERR__ ?? null,
  };
})()`);

const report = {};
for (const theme of ['dark', 'light']) {
  await wear({ theme });
  // Open the chat: click its row for real.
  const at = await evaluate(`(() => { const el = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && e.textContent.trim() === 'Tighten the landing page copy'); if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
  if (!at) {
    await capture(path.join(outDir, `${theme}-0-no-row.png`));
    console.log(await evaluate(`document.body.innerText.slice(0, 600) + ' | err ' + (window.__ERR__ ?? '')`));
    throw new Error('the chat row is not on screen');
  }
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await call('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', clickCount: 1 });
  }
  await wait(1500);
  const shown = await evaluate(`document.body.innerText.includes('move the FAQ above the footer')`);

  await evaluate('window.__press({ step: 0 })');
  await wait(300);
  const opened = await state();
  await type('landing page');
  await wait(400);
  const typed = await state();
  await capture(path.join(outDir, `${theme}-1-typed.png`));
  await key('Enter', 'Enter', 13);
  await wait(300);
  const next = await state();
  await key('Enter', 'Enter', 13, 8); // shift
  await wait(300);
  const back = await state();
  // THE BUTTONS, PRESSED FOR REAL (her report, 2026-09-27: "I can't click any
  // of these buttons"). A real press at each button's own centre, after asking
  // the page which element is under that point. This proves the page side
  // only; a window drag strip is native and a headless browser has none.
  const press = async (label) => {
    const at = await evaluate(`(() => { const b = document.querySelector('.find-bar [aria-label="${label}"]'); if (!b) return null; const r = b.getBoundingClientRect(); const x = r.x + r.width / 2; const y = r.y + r.height / 2; const hit = document.elementFromPoint(x, y); return { x, y, hit: hit === b || b.contains(hit) }; })()`);
    if (!at) return { label, missing: true };
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await call('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', clickCount: 1 });
    }
    await wait(300);
    return { label, hitIsTheButton: at.hit, after: (await state()).label };
  };
  const clicks = [await press('Next match'), await press('Previous match'), await press('Close')];
  await evaluate('window.__press({ step: 0 })'); // Close shut it; the rest needs it open
  await wait(300);
  await evaluate('window.__press({ step: 1 })'); // ⌘G
  await wait(300);
  const cmdG = await state();
  // Something she sent, by a word only her replies carry.
  await evaluate(`(() => { const i = document.querySelector('.find-input'); i.select(); })()`);
  await type('cramped');
  await wait(400);
  const hers = await state();
  await capture(path.join(outDir, `${theme}-2-her-words.png`));
  await evaluate(`(() => { const i = document.querySelector('.find-input'); i.select(); })()`);
  await type('zebra');
  await wait(400);
  const none = await state();
  await capture(path.join(outDir, `${theme}-3-none.png`));
  await key('Escape', 'Escape', 27);
  await wait(300);
  const closed = await state();
  const cardStillOpen = await evaluate(`document.body.innerText.includes('move the FAQ above the footer')`);
  report[theme] = { shown, opened, typed, next, back, clicks, cmdG, hers, none, closed, cardStillOpen };
}
console.log(JSON.stringify(report, null, 1));
inbox.close();
