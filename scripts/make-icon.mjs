// Draw the app icon and turn it into build/icon.icns.
//
//   npm run icon              rasterise the Agentbox icon and install it as build/icon.icns
//
// THE ICON IS renderer/src/assets/agentbox-icon.svg, the "On the grid" icon made
// for the launch film and picked as the full icon, tile and all (2026-09-26).
// It is the same file AppMark draws in the app and the README shows, so the
// three cannot drift. It is already a finished macOS icon: a 1024 canvas, the
// art inset to Apple's 824, the corner a real superellipse, its own contact
// shadow. So this script only rasterises it; it draws nothing of its own.
//
// It replaced the drawn sunburst this script used to generate, which was the
// app's mark until the founder retired it.
//
// WHY THIS IS A SCRIPT AND NOT A PNG SOMEBODY EXPORTED. A macOS icon is one
// drawing at ten sizes, and the .icns has to be rebuilt whenever the drawing
// moves. A checked-in binary drifts from whatever produced it within a week.
//
// IT RUNS IN ELECTRON, NOT IN CHROME. Headless Chrome over the devtools
// protocol was broken on this machine as of 2026-08-20 (it never opened a page
// target). Electron is already a dependency, it is the same renderer the app
// itself draws with, and `capturePage` needs none of that.

import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(repo, 'renderer', 'src', 'assets', 'agentbox-icon.svg');
const outDir = path.join(repo, 'build', 'icons');

const page = `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;width:1024px;height:1024px;background:transparent}
  img{display:block;width:1024px;height:1024px}
</style><img src="${path.basename(SOURCE)}">`;

app.disableHardwareAcceleration();

// NOT `await app.whenReady` AT THE TOP LEVEL. Electron finishes bringing the
// app up only after the main module has finished evaluating, and a top-level
// await never lets it: measured here 2026-08-20, the process sat live and
// printed nothing at all, which reads exactly like a script with a bug in it.
app.whenReady().then(main).catch((err) => { console.error(err); app.exit(1); });

async function main() {
fs.mkdirSync(outDir, { recursive: true });
const scratch = path.join(repo, 'build', '.icon-scratch');
fs.mkdirSync(scratch, { recursive: true });
fs.copyFileSync(SOURCE, path.join(scratch, path.basename(SOURCE)));

// OFF SCREEN RATHER THAN HIDDEN. `show: false` was the obvious way to draw
// without a window appearing, and `capturePage` never came back from it here
// (2026-08-20: the process sat live and silent until it was killed). A window
// that is genuinely on screen, three thousand points to the left of it, paints
// like any other and captures immediately.
const win = new BrowserWindow({
  width: 1024, height: 1024, x: -4000, y: 0, show: false, frame: false,
  transparent: true, backgroundColor: '#00000000',
  skipTaskbar: true,
  webPreferences: { backgroundThrottling: false },
});
win.showInactive();

const file = path.join(scratch, 'icon.html');
fs.writeFileSync(file, page, 'utf8');
await win.loadFile(file);
// Capturing before the first paint lands writes a transparent square, which
// looks exactly like a script with a bug in it.
await new Promise((r) => setTimeout(r, 400));
const image = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });
const source = path.join(outDir, 'icon.png');
fs.writeFileSync(source, image.toPNG());
console.log(`  build/icons/icon.png  ${image.getSize().width}x${image.getSize().height}`);
win.destroy();
fs.rmSync(scratch, { recursive: true, force: true });

// .icns wants a folder of exact sizes with Apple's exact names. iconutil is
// strict about both: one missing size and it refuses the whole set.
const iconset = path.join(repo, 'build', 'icon.iconset');
fs.rmSync(iconset, { recursive: true, force: true });
fs.mkdirSync(iconset, { recursive: true });
for (const [size, name] of [
  [16, 'icon_16x16.png'], [32, 'icon_16x16@2x.png'],
  [32, 'icon_32x32.png'], [64, 'icon_32x32@2x.png'],
  [128, 'icon_128x128.png'], [256, 'icon_128x128@2x.png'],
  [256, 'icon_256x256.png'], [512, 'icon_256x256@2x.png'],
  [512, 'icon_512x512.png'], [1024, 'icon_512x512@2x.png'],
]) {
  execFileSync('sips', ['-z', String(size), String(size), source, '--out', path.join(iconset, name)], { stdio: 'ignore' });
}
execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(repo, 'build', 'icon.icns')]);
fs.rmSync(iconset, { recursive: true, force: true });
console.log(`\nbuild/icon.icns  (${(fs.statSync(path.join(repo, 'build', 'icon.icns')).size / 1024).toFixed(0)} KB)`);
app.exit(0);
}
