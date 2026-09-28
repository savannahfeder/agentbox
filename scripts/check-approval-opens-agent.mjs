// DOES THE CARD ACTUALLY GO INTO THE AGENT (w-34b7b861b6)?
//
//   arch -arm64 node scripts/check-approval-opens-agent.mjs
//
// Half her ask was "a clear way for me to see and even go into the agent", and
// a title that looks like a link but opens nothing would satisfy the shot and
// not the ask. So this presses it, with a real mouse event rather than
// `el.click()`, because a synthetic click skips hit testing and would pass over
// a button something else is covering.
//
// It asserts three things, and the third is the one a careless build breaks:
// the row opens, the approval card is STILL on screen, and the card is still
// unanswered.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { openInbox } from './lib/inbox-harness.mjs';
import { foldWorkItems } from '../shared/work-items.mjs';
import { MACHINERY_PREFIX } from './lib/machine-paths.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(`${MACHINERY_PREFIX}astral`, 'work-items.jsonl');
const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)
  .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const items = [...foldWorkItems(lines).values()].map((i) => ({ ...i, product: 'astral', productName: 'Agentbox' }));
const row = items.find((i) => i.status === 'claimed' && i.title) ?? items.find((i) => i.title);

const snap = {
  products: [{ slug: 'astral', name: 'Agentbox' }],
  items,
  approvals: [{
    id: 'check-1', at: Date.now() - 3000, product: 'astral', item: row.id,
    tool: 'Bash', input: { command: 'npm test', cwd: '/tmp/ab-serve' },
  }],
  supervisor: {
    paused: false, pausedProducts: [], running: [], stalled: [], queued: [], scheduled: [],
    productOrder: ['astral'], hiddenProducts: [], personalProducts: [], capacity: 4,
  },
  restartNeeded: null,
  config: {},
};

const h = await openInbox({ dist: path.join(root, 'renderer', 'dist'), width: 1440, height: 944, snapshot: snap });
await h.wear({ theme: 'dark', skin: 'cel-dusk' });
await h.wait(900);

const before = await h.evaluate(`(() => {
  const b = document.querySelector('.approval-task');
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { x: r.left + 40, y: r.top + r.height / 2, text: b.innerText.trim() };
})()`);
if (!before) { console.log('FAIL: no .approval-task button on the card'); h.close(); process.exit(1); }
console.log('pressing:', JSON.stringify(before.text));

// A real press, so hit testing decides whether this button is reachable.
for (const type of ['mousePressed', 'mouseReleased']) {
  await h.call('Input.dispatchMouseEvent', { type, x: before.x, y: before.y, button: 'left', clickCount: 1 });
}
await h.wait(900);

// `workspace-task` is the class the shell puts on `.app` once a row is open.
// Read off the running page rather than guessed: an earlier version of this
// check asserted `.app.flat`, which is a different layout entirely, and
// reported a failure on a click that had worked.
const after = await h.evaluate(`(() => ({
  rowOpen: !!document.querySelector('.app.workspace-task'),
  cardStillThere: !!document.querySelector('.approval-card'),
  answered: !!document.querySelector('.approval-card.answered'),
  error: window.__ERR__ || null,
}))()`);
console.log(after);

const ok = after.rowOpen && after.cardStillThere && !after.answered && !after.error;
console.log(ok ? 'PASS: the row opened, the card stayed, nothing was answered' : 'FAIL');
h.close();
process.exit(ok ? 0 : 1);
