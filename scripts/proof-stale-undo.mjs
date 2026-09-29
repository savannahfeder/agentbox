// PRESS E, WAIT A MINUTE, PRESS Z: WHAT THE REAL RENDERER DOES.
//
// w-da37b95d1a. A row she closed at 1:18pm was back in her inbox at 1:21pm,
// written to the ledger as her own hand. Reading the code says why (the undo
// stack never aged, so Z reached a three-minute-old close); this drives the built
// renderer through Chromium's own input pipeline and records what the app asks
// the store to write, so the before and the after are measured rather than
// argued.
//
//   node scripts/proof-stale-undo.mjs <outDir> [distDir]
//
// distDir defaults to renderer/dist-x in this checkout. Build it first:
//   npm run build -- --outDir dist-x
// Point it at another checkout's dist-x to run the same two presses against a
// build that does not have the fix.
//
// The bridge here RECORDS every write instead of refusing it, which is the whole
// measurement: a stale Z that reopens the row shows up as a second
// `{status:'open'}` in the list it prints.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openInbox } from './lib/inbox-harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = process.argv[2] ?? path.join(root, 'shots');
const dist = process.argv[3] ?? path.join(root, 'renderer', 'dist-x');
fs.mkdirSync(outDir, { recursive: true });

const now = Date.now();
const row = (id, title) => ({
  id, product: 'agentbox', productName: 'Agentbox', status: 'open', kind: 'task',
  // No `founder` label: an agent-filed proposal, which is the shape that sits in
  // her inbox waiting to be closed (`belongsInInbox`).
  title, body: `**${title}**\n\nA row to close.`, priority: 0, labels: [],
  createdAt: now - 600_000, updatedAt: now - 600_000,
});
const snapshot = {
  products: [{ slug: 'agentbox', name: 'Agentbox' }],
  items: [
    row('w-proof-one', 'The reply box says which mode it is in'),
    row('w-proof-two', 'The idle screen keeps her wallpaper'),
    row('w-proof-three', 'Privacy pages say who holds the keys'),
  ],
  approvals: [],
  supervisor: {
    paused: false, pausedProducts: [], running: [], stalled: [], queued: [], scheduled: [],
    productOrder: ['agentbox'], hiddenProducts: [], personalProducts: [], capacity: 4,
  },
  restartNeeded: null,
  config: {},
};

const h = await openInbox({ dist, width: 1280, height: 900, snapshot });

// The harness's own bridge refuses every write. This one keeps them, and moves
// the row in the snapshot so the list behaves as it would against the store.
await h.call('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    window.__WRITES__ = [];
    // ONE PRESS HAS TO BE ONE KEYDOWN or every count below is off by a factor
    // nobody can see. The confirm step made that visible: a press that arrives
    // twice asks and answers itself in one keystroke.
    window.__KEYS__ = 0;
    window.addEventListener('keydown', () => { window.__KEYS__ += 1; }, true);
    (function () {
      const ready = () => {
        if (!window.zero) return setTimeout(ready, 5);
        window.zero.answer = async (p) => {
          window.__WRITES__.push({ id: p.id, status: p.status ?? null, answer: p.answer ?? null, at: Date.now() });
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

// ONE PRESS, DISPATCHED IN THE PAGE, AND THE REASON IS NOT CONVENIENCE.
//
// `Input.dispatchKeyEvent` is the right way to press a key and it cannot be used
// here. Measured 2026-09-27 on this Mac's headless Chrome, on about:blank with
// nothing else on the page: ONE keyDown followed by its keyUp produced between
// 7,342 and 8,233 trusted keydown events, and the same on `rawKeyDown`, and the
// same with `autoRepeat: false`. That is a hundred times faster than any key
// repeat, so it is not the OS; it is this browser, and it is not the app. It
// went unnoticed while a second press did nothing extra, and the confirm step is
// exactly the change that made it visible: a press that lands eight thousand
// times asks its question and answers it in the same keystroke.
//
// The app's shortcuts are a plain `keydown` listener on the window, so a
// dispatched KeyboardEvent runs the real handler, the real `undo`, and the real
// bridge write. WHAT IT DOES NOT PROVE is the browser's focus routing: the event
// has no element behind it, so it arrives as though her caret were on the body.
// That is the state these rounds are about. A press into a text field is a
// different question and `typing-owns-the-keyboard.test.mjs` is where it lives.
const press = async (k) => {
  await h.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true, cancelable: true })), 1`);
};
const writes = async () => JSON.parse(await h.evaluate('JSON.stringify(window.__WRITES__)'));
const toast = async () => h.evaluate("(document.querySelector('.toast')?.textContent ?? '')");
const rows = async () => h.evaluate("document.querySelectorAll('.row').length");

const report = [];
async function round(name, wait, keys, shot) {
  await h.wear({ theme: 'dark' }); // a fresh document, so a fresh undo stack
  const before = await rows();
  await press('e');
  await h.wait(4000); // past the three second grace, so the close is committed
  const closed = await writes();
  await h.wait(wait);
  for (const k of keys) { await press(k); await h.wait(900); }
  const after = await writes();
  const said = await toast();
  await h.capture(path.join(outDir, shot));
  report.push({
    name,
    rowsAtStart: before,
    waitedAfterTheClose: `${Math.round((4000 + wait) / 1000)}s`,
    thenPressed: keys.join(' then '),
    closeWrote: closed.map((w) => w.status),
    wrote: after.map((w) => w.status),
    toast: said,
    keydownsSeen: await h.evaluate('window.__KEYS__'),
  });
}

// The reflex press, inside the thirty seconds: it acts at once, as it always has.
await round('Z four seconds after the close', 0, ['z'], 'undo-in-the-moment.png');
// Past the thirty seconds, one press: it asks and touches nothing.
await round('Z forty four seconds after the close', 40_000, ['z'], 'undo-asks-first.png');
// Past the thirty seconds, two presses: the second one is the yes.
await round('Z twice, forty four seconds after the close', 40_000, ['z', 'z'], 'undo-confirmed.png');
// Any other key is a no, and the question has to be asked again.
await round('Z, then another key, then Z', 40_000, ['z', 'j', 'z'], 'undo-answered-no.png');

h.close();
console.log(JSON.stringify({ dist, report }, null, 2));
