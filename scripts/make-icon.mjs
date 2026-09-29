// Draw the app icon and turn it into build/icon.icns.
//
//   npm run icon              draw the mark and install it as build/icon.icns
//
// WHY THIS IS A SCRIPT AND NOT A PNG SOMEBODY EXPORTED. A macOS icon is one
// drawing at ten sizes, and the .icns has to be rebuilt whenever the drawing
// moves. A checked-in binary drifts from whatever produced it within a week,
// and then nobody can change the icon without redrawing it from scratch.
//
// IT RUNS IN ELECTRON, NOT IN CHROME. Every other drawing script in this folder
// drives headless Chrome over the devtools protocol. That path is broken on
// this machine as of 2026-08-20: Chrome starts, writes its devtools port, and
// then never opens a page target, so the script hangs until something kills it.
// Electron is already a dependency, it is the same renderer the app itself
// draws with, and `capturePage` on a hidden window needs none of that.
//
// THE GEOMETRY IS APPLE'S, NOT INVENTED HERE. Since Big Sur every app icon is
// the same rounded square at the same size: a 1024 canvas with the art inset to
// 824, and the corner is a continuous curve (a superellipse) rather than a
// circular radius. A CSS border-radius is visibly not that shape beside the
// system's own icons in the dock, so the mask here is a real superellipse path.

import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pick = process.argv.slice(2).find((a) => !a.startsWith('-') && !a.endsWith('.mjs')) ?? 'mark';
const outDir = path.join(repo, 'build', 'icons');

// Superellipse |x/a|^n + |y/b|^n = 1. n = 5 is the curve Apple's mask reads as:
// flat through the middle of each side, and the corner turning continuously
// rather than snapping into an arc the way a border-radius does.
function squircle(size, n = 5, steps = 720) {
  const r = size / 2;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    const x = r + Math.sign(c) * Math.abs(c) ** (2 / n) * r;
    const y = r + Math.sign(s) * Math.abs(s) ** (2 / n) * r;
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

const ART = 824;          // Apple's art size inside a 1024 canvas
const PAD = (1024 - ART) / 2;
const MASK = squircle(ART);

// The plate is the app's own token, not a second palette: --veil-lake in
// renderer/src/styles.css is rgb(32,31,28), and it is hers.
const SLATE = 'rgb(32,31,28)';

// THE RAYS ARE THE APP'S OWN MARK, ray for ray out of
// renderer/src/components/ProductMark.tsx: twenty four of them, alternating
// 5.6/6.4 in and 11/9.6 out on a 24 grid, 1.4 round. Generated from the same
// arithmetic rather than traced, so the icon cannot drift from the mark in the
// rail or the one on the landing page.
//
// The four are gone rather than switchable; their drawings are in decisions.md
// under 08-20.
const RAYS = 24;
const GRID = 24;

function burst(size, stroke) {
  const k = size / GRID;
  const lines = [];
  for (let i = 0; i < RAYS; i++) {
    const a = (i / RAYS) * Math.PI * 2;
    const cos = Math.cos(a), sin = Math.sin(a);
    const inner = i % 2 === 0 ? 5.6 : 6.4;
    const outer = i % 2 === 0 ? 11 : 9.6;
    lines.push(`<line x1="${(12 + cos * inner) * k}" y1="${(12 + sin * inner) * k}" `
      + `x2="${(12 + cos * outer) * k}" y2="${(12 + sin * outer) * k}"/>`);
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none"
    stroke="${stroke}" stroke-width="${1.4 * k}" stroke-linecap="round">${lines.join('')}</svg>`;
}

// The burst fills 62% of the art. At the rail's own ratio it read as a speck in
// the dock at 32 pixels, which is the size that decides whether an icon is
// recognised at all.
const BURST = 0.62;

const VARIANTS = {
  // The mark on the lake's slate, in the near-white the landing page's brand bar
  // already gives it. The rail draws it at 42% because it sits beside a name
  // there and is not the subject; alone on a plate it is the subject.
  mark: `
    <div class="fill" style="background:radial-gradient(120% 100% at 50% 0%, rgb(58,62,70), ${SLATE})">
      <div class="fill" style="display:flex;align-items:center;justify-content:center">
        ${burst(Math.round(ART * BURST), '#f4f6fa')}
      </div>
    </div>`,
};

if (!VARIANTS[pick]) {
  console.error(`no such icon: ${pick}. Have: ${Object.keys(VARIANTS).join(', ')}`);
  process.exit(1);
}

const page = (name) => `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;width:1024px;height:1024px;background:transparent}
  .plate{
    position:absolute;left:${PAD}px;top:${PAD}px;width:${ART}px;height:${ART}px;
    clip-path:path('${MASK}');
    /*
     * The system draws its own shadow under a dock icon, so the art carries
       only the contact shadow Apple's own icons bake in. */
    filter:drop-shadow(0 ${Math.round(ART * 0.022)}px ${Math.round(ART * 0.035)}px rgba(0,0,0,.32));
  }
  .fill{position:absolute;inset:0}
</style><div class="plate">${VARIANTS[name]}</div>`;

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

for (const name of Object.keys(VARIANTS)) {
  const file = path.join(scratch, `${name}.html`);
  fs.writeFileSync(file, page(name), 'utf8');
  await win.loadFile(file);
  // Capturing before the first paint lands writes a transparent square, which
  // looks exactly like a script with a bug in it.
  await new Promise((r) => setTimeout(r, 400));
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });
  fs.writeFileSync(path.join(outDir, `${name}.png`), image.toPNG());
  console.log(`  build/icons/${name}.png  ${image.getSize().width}x${image.getSize().height}`);
}
win.destroy();
fs.rmSync(scratch, { recursive: true, force: true });

// .icns wants a folder of exact sizes with Apple's exact names. iconutil is
// strict about both: one missing size and it refuses the whole set.
const iconset = path.join(repo, 'build', 'icon.iconset');
fs.rmSync(iconset, { recursive: true, force: true });
fs.mkdirSync(iconset, { recursive: true });
const source = path.join(outDir, `${pick}.png`);
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
console.log(`\nbuild/icon.icns  <- ${pick}  (${(fs.statSync(path.join(repo, 'build', 'icon.icns')).size / 1024).toFixed(0)} KB)`);
app.exit(0);
}
