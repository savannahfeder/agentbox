// SIX PICTURES OF WHAT Z DOES NOW, off the built renderer.
//
// w-da37b95d1a: the proposal is shown in action, with screenshots, rather
// than described.
//
//   node scripts/shot-the-undo-question.mjs <outDir>
//
// Build the renderer first: npx vite build renderer --outDir dist-x
//
// The bridge records the writes instead of refusing them, so the list moves the
// way it would against her real store, and the shots are of the real app rather
// than a drawing of it. Keys are dispatched IN THE PAGE and the reason is in
// scripts/proof-stale-undo.mjs: one `Input.dispatchKeyEvent` on this Mac arrives
// about eight thousand times.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openInbox } from './lib/inbox-harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = process.argv[2] ?? path.join(root, 'shots');
const dist = path.join(root, 'renderer', 'dist-x');
fs.mkdirSync(outDir, { recursive: true });

const now = Date.now();
const row = (id, title, body) => ({
  id, product: 'agentbox', productName: 'Agentbox', status: 'open', kind: 'task',
  title, body, priority: 0, labels: [],
  createdAt: now - 600_000, updatedAt: now - 600_000,
});
const snapshot = {
  products: [{ slug: 'agentbox', name: 'Agentbox' }],
  items: [
    row('w-shot-one', 'The reply box says which mode it is in', 'The mode sits under the box where you can see it.'),
    row('w-shot-two', 'The idle screen keeps her wallpaper', 'Inbox zero no longer throws the picture away.'),
    row('w-shot-three', 'Privacy pages say who holds the keys', 'One page, in your words, naming what leaves this Mac.'),
  ],
  approvals: [],
  supervisor: {
    paused: false, pausedProducts: [], running: [], stalled: [], queued: [], scheduled: [],
    productOrder: ['agentbox'], hiddenProducts: [], personalProducts: [], capacity: 4,
  },
  restartNeeded: null,
  config: {},
};

const h = await openInbox({ dist, width: 1280, height: 860, snapshot });

await h.call('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    window.__WRITES__ = [];
    (function () {
      const ready = () => {
        if (!window.zero) return setTimeout(ready, 5);
        window.zero.answer = async (p) => {
          window.__WRITES__.push({ id: p.id, status: p.status ?? null });
          const it = window.__SNAP__.items.find((i) => i.id === p.id);
          if (it && p.status) { it.status = p.status; it.updatedAt = Date.now(); }
          return it ?? null;
        };
        window.zero.closeAgent = async () => ({ ok: true });
      };
      ready();
    })();
  `,
});

const press = async (k) => h.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true, cancelable: true })), 1`);
const toast = async () => h.evaluate("(document.querySelector('.toast')?.textContent ?? '')");
const rows = async () => h.evaluate("document.querySelectorAll('.row').length");

const shots = [];
const shoot = async (file, what) => {
  await h.capture(path.join(outDir, file));
  shots.push({ file, what, rows: await rows(), toast: await toast() });
};

/* ---- the reflex press: three rows, close one, take it back at once ------- */
await h.wear({ theme: 'dark' });
await shoot('01-three-rows.png', 'Three tasks in the inbox.');
await press('e');
await h.wait(1200);
await shoot('02-closed.png', 'E closes the first one. The bar says Z takes it back.');
await h.wait(4000);            // the close is committed after three seconds
await press('z');
await h.wait(1000);
await shoot('03-taken-back.png', 'Z four seconds later. The task is back, no question asked.');

/* ---- the late press: it names the task and waits ------------------------- */
await h.wear({ theme: 'dark' });
await press('e');
await h.wait(44_000);
await press('z');
await h.wait(1000);
await shoot('04-it-asks.png', 'Z forty four seconds later. Nothing happens yet. It asks.');
await press('z');
await h.wait(1000);
await shoot('05-second-z.png', 'A second Z within eight seconds. Now the task comes back.');

/* ---- and any other key is a no ------------------------------------------ */
await h.wear({ theme: 'dark' });
await press('e');
await h.wait(44_000);
await press('z');
await h.wait(900);
await press('j');              // any other key answers no
await h.wait(900);
await press('z');
await h.wait(1000);
await shoot('06-other-key-is-no.png', 'Z, then another key, then Z. The other key said no, so it asks again.');

const wrote = await h.evaluate('JSON.stringify(window.__WRITES__)');
h.close();
console.log(JSON.stringify({ outDir, shots, lastRoundWrote: JSON.parse(wrote).map((w) => w.status) }, null, 2));
