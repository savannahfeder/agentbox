// THE NEW PROJECT CARD, FOLDER FIRST (w-ec62ab6b38), photographed off the built
// renderer in headless Chrome. Nothing is injected into the card: the script
// opens it the way a person does, from ⌘K, and presses what a person presses.
// The Mac chooser is the one thing stubbed, because headless Chrome has none.
//
//   npx vite build renderer --outDir dist-fr
//   arch -arm64 node scripts/shot-the-new-project-card.mjs <outDir>
import fs from 'node:fs';
import path from 'node:path';
import { openInbox } from './lib/inbox-harness.mjs';

const outDir = process.argv[2] ?? '/tmp/new-project-card';
fs.mkdirSync(outDir, { recursive: true });

const now = Date.now();
const snapshot = {
  products: [
    { slug: 'north-sound', name: 'North Sound', repoPath: '/Users/you/code/north-sound' },
    { slug: 'harbour', name: 'Harbour', repoPath: '/Users/you/code/harbour' },
  ],
  items: [
    { id: 'w-1', product: 'north-sound', productName: 'North Sound', title: 'Added the sign-in route. Tests green.', result: 'I reused the session cookie rather than tokens.', status: 'done', kind: 'directive', createdAt: now - 3.6e6, updatedAt: now - 3.6e5, wrote: {} },
    { id: 'w-2', product: 'harbour', productName: 'Harbour', title: 'Fixed the flaky checkout test.', result: 'It was a race on the fixture.', status: 'done', kind: 'directive', createdAt: now - 7.2e6, updatedAt: now - 8.4e5, wrote: {} },
  ],
  agents: [], approvals: [],
  supervisor: { paused: false, pausedProducts: [], running: [], stalled: [], queued: [], scheduled: [], productOrder: [], hiddenProducts: [], personalProducts: [], capacity: 4 },
  restartNeeded: null, config: {},
};

const app = await openInbox({ dist: 'renderer/dist-fr', width: 1440, height: 900, snapshot });
const { call, evaluate, wait, goto, origin, capture } = app;
await goto(origin);
await evaluate(`localStorage.setItem('zero.firstRun.done', '1'); localStorage.setItem('zero.theme', 'dark'); localStorage.setItem('zero.skin', 'valley-haze')`);
await goto(origin);
await wait(2000);

// The chooser answers with a folder that already has code in it.
await evaluate(`(() => {
  window.zero.chooseFolder = async () => ({ path: '/Users/you/code/lantern-web' });
  // A name typed from scratch proposes a folder that is not there yet.
  window.zero.folderExists = async () => false;
})()`);

const typeText = async (s) => { for (const ch of s) await call('Input.dispatchKeyEvent', { type: 'char', text: ch }); };
const press = async (key, code, vk, modifiers = 0) => {
  await call('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: vk, modifiers });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, modifiers });
};
const openCard = async () => {
  await press('k', 'KeyK', 75, 4);
  await wait(500);
  await typeText('new project');
  await wait(400);
  await press('Enter', 'Enter', 13);
  await wait(900);
};
const click = (sel) => evaluate(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (b) b.click(); return !!b; })()`);
const text = (sel) => evaluate(`(() => document.querySelector(${JSON.stringify(sel)})?.innerText ?? null)()`);

await openCard();
console.log('ask      :', await text('.np-card'));
await capture(path.join(outDir, '1-which-folder.png'));

await click('.np-card .dock-send');
await wait(700);
console.log('chosen   :', await text('.np-card'), '| name =', await evaluate(`document.querySelector('.np-name')?.value`));
await capture(path.join(outDir, '2-folder-chosen-name-filled.png'));

await press('Escape', 'Escape', 27);
await wait(500);
await openCard();
await click('.np-card .np-clauses');
await wait(500);
await typeText('Lantern');
await wait(700);
console.log('fresh    :', await text('.np-card'));
await capture(path.join(outDir, '3-no-code-yet.png'));

console.log('errors   :', await evaluate('window.__ERR__ ?? null'));
app.close();
