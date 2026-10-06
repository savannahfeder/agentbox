// DOES FINISHING A TASK OPENED FROM THE BOARD OPEN THE NEXT ONE (w-34eb858714).
//
//   arch -arm64 node scripts/probe-the-board-moves-on.mjs [dist] [view]
//
// Headless, off-screen, on the fixture inbox. Puts the page on the board,
// opens the first card in Waiting, presses E, and says what is on the screen
// afterwards: a task, or the board. `view` is the tab the page was last on
// before the board (inbox, progress, all...), set by clicking it in the list.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openInbox } from './lib/inbox-harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = process.argv[2] ?? path.join(root, 'renderer', 'dist');
const tab = process.argv[3] ?? 'inbox';

const h = await openInbox({ dist, width: 1440, height: 944, snapshot: { products: [], items: [] } });
const url = `${h.origin}/?fixtures=1`;
await h.goto(url);
await h.evaluate(`localStorage.setItem('zero.firstRun.done', '1'); localStorage.setItem('zero.theme', 'dark'); localStorage.setItem('threads.display.inbox', JSON.stringify({ view: 'list' }))`);
await h.goto(url);
await h.wait(1200);
// The tab she was last on in the list, then over to the board.
if (tab !== 'inbox') {
  console.log('tab', await h.evaluate(`(() => { const tabs = [...document.querySelectorAll('.tm-tab')]; const b = tabs.find((x) => x.innerText.toLowerCase().startsWith(${JSON.stringify(tab)})); if (!b) return 'no tab ' + ${JSON.stringify(tab)} + ' in ' + tabs.map((x) => x.innerText).join('/'); b.click(); return 'clicked ' + b.innerText; })()`));
  await h.wait(500);
}
await h.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true }))`);
await h.wait(800);

const screen = () => h.evaluate(`(() => {
  const open = document.querySelector('.workspace-task-header');
  const board = document.querySelector('.th-board');
  const title = open ? [...document.querySelectorAll('h1, h2')].map((x) => x.innerText).filter(Boolean).join(' / ') : undefined;
  const cols = [...document.querySelectorAll('.th-col')].map((c) => (c.querySelector('.th-col-h') || {}).innerText?.replace(/\\s+/g, ' ') + ': ' + [...c.querySelectorAll('.th-card .t')].map((t) => t.innerText.slice(0, 30)).join(' | '));
  return { taskOpen: !!open, board: !!board, title: title && title.slice(0, 60), cols: board ? cols : undefined };
})()`);

console.log('before', JSON.stringify(await screen(), null, 1));
const opened = await h.evaluate(`(() => { const col = [...document.querySelectorAll('.th-col')].find((c) => /waiting|needs you/i.test(c.innerText.split('\\n')[0])); const card = col && col.querySelector('.th-card'); if (!card) return null; const t = card.querySelector('.t').innerText; card.click(); return t; })()`);
console.log('opened', opened);
await h.wait(800);
console.log('open', JSON.stringify(await screen()));
await h.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }))`);
await h.wait(1200);
const after = await screen();
console.log('after E', JSON.stringify(after));
if (process.env.SHOT) await h.capture(process.env.SHOT);
console.log(after.taskOpen ? 'RESULT: the next task opened' : 'RESULT: dropped back to the board');
h.close();
