// The README's still pictures, photographed from the real renderer.
//
// The README is the first screen most people ever see of this app, so its
// pictures are taken of the app itself rather than drawn: a mockup drifts from
// the product within a week, and the renderer cannot. The inbox below is
// invented, written to match the launch film's twelve tickets, and it is fed
// through the same read-only bridge the other shot scripts use, headless, so no
// store and no agent is touched and no window opens on anyone's screen.
//
//   arch -arm64 node scripts/shot-readme.mjs <dist> [outDir]
//
// <dist> is a built renderer (renderer/dist after `npx vite build` in
// renderer/).
//
// The moving pictures are cut from the launch film, which is not in this repo.
// Each is a few seconds of it, denoised (the film's grain made a GIF of one
// clip 22 MB) and written as a lossy animated WebP, about 0.5 MB each:
//
//   ffmpeg -ss <start> -t <seconds> -i film.mp4 \
//     -vf "hqdn3d=6:6:10:10,fps=15,scale=960:-1:flags=lanczos" frames/%04d.png
//   img2webp -loop 0 -lossy -q 55 -m 4 -mixed -d 67 <all but last> \
//     -d 1500 <last> -o docs/readme/<name>.webp
//
// The last frame is held so a loop can be read before it starts again.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openInbox } from './lib/inbox-harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = process.argv[2] ?? path.join(root, 'renderer', 'dist');
const outDir = process.argv[3] ?? path.join(root, 'docs', 'readme');
fs.mkdirSync(outDir, { recursive: true });

const now = Date.now();
const min = 60_000;
const products = [
  { slug: 'storefront', name: 'Storefront', dir: '/fixtures/storefront', repoPath: '/Users/you/dev/storefront' },
  { slug: 'mobile', name: 'Mobile', dir: '/fixtures/mobile', repoPath: '/Users/you/dev/mobile' },
];

// Each row is a task you wrote and an agent has answered: the title is your
// ask, the first line under it is the agent's answer.
const rows = [
  ['storefront', 9, 'Checkout fails for some customers since this morning', 'Found it. Tax rounding broke on carts over $1,000. Fixed and tested. Merge it?'],
  ['mobile', 9, 'Sign in loops back to the start screen on Android', 'The token was saved after the redirect, not before. Fixed on both builds. Merge it?'],
  ['storefront', 5, 'Snooze is lost on restart', 'Snooze survives a restart now. Every test passes. Merge it?'],
  ['storefront', 5, 'Redesign the empty inbox', 'Three directions are drawn in the app. Nothing is built yet. Pick one.'],
  ['mobile', 5, 'J and K skip rows after an undo', 'The cursor kept its old index. Fixed and tested. Merge it?'],
  ['storefront', 5, 'The weekly usage total is off by one', 'The usage test passes now. I updated the expected total. Merge it?'],
  ['storefront', 5, 'Command K should search closed tasks', 'Closed tasks show under their own heading. Merge it?'],
  ['mobile', 2, 'Onboarding checklist copy', 'Two versions of the copy are written. Which one?'],
  ['storefront', 2, 'Write the release notes for today', 'Drafted from the nine merges since this morning. Ship it?'],
];
const items = rows.map(([product, priority, title, result], i) => ({
  id: `w-readme${i}`,
  product,
  productName: products.find((p) => p.slug === product).name,
  status: 'done',
  kind: 'directive',
  title,
  body: title,
  result,
  labels: ['founder'],
  priority,
  epoch: 2,
  claim: null,
  createdAt: now - (90 + i * 7) * min,
  updatedAt: now - (4 + i * 6) * min,
  wrote: {
    title: { ts: now - (90 + i * 7) * min, source: 'founder' },
    body: { ts: now - (90 + i * 7) * min, source: 'founder' },
    result: { ts: now - (4 + i * 6) * min, source: 'agent' },
    status: { ts: now - (4 + i * 6) * min, source: 'agent' },
  },
}));

const snapshot = {
  products,
  items,
  approvals: [],
  supervisor: {
    paused: false, pausedProducts: [], running: [], stalled: [], queued: [], scheduled: [],
    productOrder: ['storefront', 'mobile'],
    hiddenProducts: [], personalProducts: [], capacity: 0,
  },
  restartNeeded: null,
  config: {},
};

async function key(h, k, code, modifiers = 0) {
  await h.call('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, modifiers, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) });
  await h.call('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, modifiers, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) });
}

// The README shows a part of the window, so the crop is taken here rather than
// by hand afterwards. Rectangles are in CSS pixels; the file is twice that.
async function shoot(h, file, clip) {
  const { data } = await h.call('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 } });
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  return file;
}

async function type(h, text) {
  for (const ch of text) await h.call('Input.dispatchKeyEvent', { type: 'char', text: ch });
}

const h = await openInbox({ dist, width: 1280, height: 760, snapshot });
try {
  await h.goto(h.origin);
  await h.evaluate(`localStorage.setItem('zero.firstRun.done', '1'); localStorage.setItem('zero.theme', 'dark');`);
  await h.goto(h.origin);
  await h.evaluate(`(async () => { await document.fonts.ready; })()`);
  await h.wait(1500);
  const err = await h.evaluate('window.__ERR__ ?? null');
  if (err) console.error('page error:', err);
  // The top of the inbox: the Urgent block and the first rows under it.
  console.log(await shoot(h, path.join(outDir, 'inbox-urgent.png'), { x: 0, y: 0, width: 1280, height: 505 }));

  // Priority is set from ⌘K by name, on whatever row is selected. The third
  // row is a Medium one, so the picture is of raising it.
  for (let i = 0; i < 3; i += 1) {
    await key(h, 'ArrowDown', 'ArrowDown');
    await h.wait(150);
  }
  await key(h, 'k', 'KeyK', 4);
  await h.wait(500);
  await type(h, 'priority');
  await h.wait(700);
  // The palette alone, without the half rows either side of it.
  console.log(await shoot(h, path.join(outDir, 'priority-palette.png'), { x: 320, y: 177, width: 640, height: 218 }));
} finally {
  h.close();
}
