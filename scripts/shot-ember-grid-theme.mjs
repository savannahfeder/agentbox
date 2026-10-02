// Photographs the Ember Grid theme (w-b3e123a0af) across the app's screens, in
// the built renderer, on a fictional inbox whose rows are the launch film's own,
// so a still of the app can be laid beside a still of the film.
//
//   arch -arm64 node scripts/shot-ember-grid-theme.mjs <dist> <out-dir> [skin]
//
// Headless Chrome, so run it as arm64 or Chrome never answers. Every screen is
// opened from a fresh load of the inbox, so one screen cannot leak into the next.
import fs from 'node:fs';
import path from 'node:path';
import { openInbox } from './lib/inbox-harness.mjs';
import { foldWorkItems } from '../shared/work-items.mjs';

const [dist = 'renderer/dist', out = '/tmp/ember-grid-shots', skin = 'ember-grid'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });

const OPEN = [
  ['Dark mode flashes white on launch', 'The window now paints dark first. Tests pass. Merge it?'],
  ['Export a thread as markdown', 'Added to the menu. Tests pass. Merge it?'],
  ['Search misses archived threads', 'Fixed, and the tests pass. Merge it?'],
  ['Retry failed runs automatically', 'Retries twice, then asks you. Tests pass. Merge it?'],
  ['Snooze until next Monday', 'Done, with a test for the weekend edge case. Merge it?'],
  ['Keyboard focus lost after closing', 'Focus returns to the list. Tests pass. Merge it?'],
  ['Settings page loads slowly', 'It no longer waits on the network. Tests pass. Merge it?'],
  ['Show token usage per thread', 'A small count under each thread. Tests pass. Merge it?'],
];
const WORKING = ['Add a weekly digest email', 'Import issues from Linear', 'Speed up the first launch'];
const CLOSED = ['Fix the flicker on resize', 'Remember the window size', 'Rename projects inline', 'Quieter notification sound'];

const now = Date.now();
let n = 0;
const nextId = () => `w-${(0xa0b0c0 + n++).toString(16)}f0`;
const lines = [
  ...OPEN.flatMap(([title, result], i) => {
    const id = nextId();
    const ts = now - (i + 1) * 7 * 60_000;
    return [
      { id, ts, source: 'system', patch: { title, status: 'open', kind: 'review', priority: 5, labels: [] } },
      { id, ts: ts + 1, source: 'agent', patch: { title, body: `**${result}**\n\n## Options\n1. Merge it (recommended)\n2. Change it first\n3. Leave it on the branch` } },
      { id, ts: ts + 2, source: 'agent', patch: { result } },
    ];
  }),
  ...WORKING.flatMap((title, i) => {
    const id = nextId();
    const ts = now - (i + 1) * 4 * 60_000;
    return [
      { id, ts, source: 'system', patch: { title, status: 'open', kind: 'directive', priority: 5, labels: [] } },
      { id, ts: ts + 1, source: 'agent', epoch: 1, claim: { holder: 'shot', leaseUntil: now + 3_600_000 } },
      { id, ts: ts + 2, source: 'agent', patch: { status: 'claimed', note: 'Reading the code that decides this.' } },
    ];
  }),
  ...CLOSED.flatMap((title, i) => {
    const id = nextId();
    const ts = now - (i + 2) * 60 * 60_000;
    return [
      { id, ts, source: 'system', patch: { title, status: 'open', kind: 'directive', priority: 5, labels: [] } },
      { id, ts: ts + 1, source: 'agent', patch: { status: 'done', result: 'Merged, and the tests pass.' } },
    ];
  }),
];
const items = [...foldWorkItems(lines).values()].map((it) => ({ ...it, product: 'agentbox', productName: 'agentbox' }));
const snapshot = (list) => ({
  products: [{ slug: 'agentbox', name: 'agentbox' }], items: list, approvals: [],
  supervisor: {
    paused: false, pausedProducts: [], running: [], stalled: [], queued: [], scheduled: [],
    productOrder: ['agentbox'], hiddenProducts: [], personalProducts: [], capacity: 4,
  },
  restartNeeded: null, config: {},
});

// Clicks the first visible element whose own text is exactly `text`.
const clickText = (text) => `(() => {
  const el = [...document.querySelectorAll('button, a, [role=tab], [role=button]')]
    .find((e) => e.offsetParent && e.textContent.trim() === ${JSON.stringify(text)});
  if (!el) return false; el.click(); return true;
})()`;
const clickSel = (sel) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.click(); return true; })()`;

async function key(h, k, modifiers = 0) {
  const code = k.length === 1 ? `Key${k.toUpperCase()}` : k;
  const vk = k.length === 1 ? k.toUpperCase().charCodeAt(0) : 13;
  await h.call('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers });
  await h.call('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers });
}

const SCREENS = [
  ['01-inbox', async () => {}],
  ['02-new-task', async (h) => h.evaluate(clickSel('.workspace-create'))],
  ['03-thread', async (h) => key(h, 'Enter')],
  ['04-in-progress', async (h) => h.evaluate(clickSel('.workspace-tab:nth-child(2)'))],
  ['05-closed', async (h) => h.evaluate(clickSel('.workspace-tab:nth-child(3)'))],
  ['06-command-menu', async (h) => key(h, 'k', 4)],
  ['07-search', async (h) => h.evaluate(clickSel('.workspace-search'))],
  ['08-projects', async (h) => h.evaluate(clickSel('.workspace-utilities button[aria-label="Projects"]'))],
  ['09-instructions', async (h) => h.evaluate(clickSel('.workspace-utilities button[aria-label="Instructions"]'))],
  ['10-shortcuts', async (h) => h.evaluate(clickSel('.workspace-utilities button[aria-label="Keyboard shortcuts"]'))],
  ['11-settings', async (h) => h.evaluate(clickSel('.workspace-utilities button[aria-label="Settings"]'))],
  ['12-settings-themes', async (h) => {
    await h.evaluate(clickSel('.workspace-utilities button[aria-label="Settings"]'));
    await h.wait(700);
    return h.evaluate(clickText('Appearance'));
  }],
];

async function boot(h) {
  await h.wear({ theme: 'dark', skin });
  await h.evaluate(`localStorage.setItem('zero.firstRun.done', '1')`);
  await h.wear({ theme: 'dark', skin });
}

const h = await openInbox({ dist, snapshot: snapshot(items), width: 1440, height: 900 });
try {
  for (const [name, open] of SCREENS) {
    await boot(h);
    const hit = await open(h);
    await h.wait(1100);
    await h.capture(path.join(out, `${name}.png`));
    console.log(name, hit === false ? 'CONTROL NOT FOUND' : 'ok', await h.evaluate('window.__ERR__ || ""'));
  }
} finally {
  h.close();
}

// Inbox zero is its own page, so it gets a store with nothing waiting.
const empty = await openInbox({ dist, snapshot: snapshot(items.filter((i) => i.status === 'done')), width: 1440, height: 900 });
try {
  await boot(empty);
  await empty.wait(1100);
  await empty.capture(path.join(out, '13-inbox-zero.png'));
  console.log('13-inbox-zero ok');
} finally {
  empty.close();
}
