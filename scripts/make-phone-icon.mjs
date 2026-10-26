// Draw the phone's home-screen icon, main/phone-icon.png.
//
//   npx electron --force-color-profile=srgb scripts/make-phone-icon.mjs
//
// FROM THE SAME DRAWING AS THE MAC ICON (renderer/src/assets/agentbox-icon.svg),
// but cut to its tile. The Mac icon is a tile floating on a see-through margin
// with its own shadow, which is right on a Mac and wrong on a phone: iOS fills
// everything see-through with white and rounds the corners itself, so the home
// screen showed the tile inside a white border ("the logo with like a white
// border around it rather than just showing the logo on its own", 2026-10-13).
// So the margin, the shadow and the tile's edge line go, the tile's own
// background fills the square edge to edge, and the dots keep their place on it.
// tests/the-phone-icon-fills-its-square.test.mjs checks the result.
//
// Electron, off screen, for the reasons scripts/make-icon.mjs gives.
import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(repo, 'renderer', 'src', 'assets', 'agentbox-icon.svg');
const OUT = path.join(repo, 'main', 'phone-icon.png');
const SIZE = 512;

/** The Mac drawing, cut to its tile and filled edge to edge. */
export function phoneDrawing(svg) {
  return svg
    .replace('viewBox="0 0 1024 1024"', 'viewBox="100 100 824 824"')
    // The shadow under the tile, and the light line along its edge.
    .replace(' filter="url(#tile-shadow)"', '')
    .replace(/<use [^>]*stroke="#ffffff"[^>]*\/>/, '')
    // The tile's own background, square, under everything else.
    .replace('</defs>', '</defs><rect x="100" y="100" width="824" height="824" fill="url(#tile-bg)"/>');
}

app.disableHardwareAcceleration();
app.whenReady().then(main).catch((err) => { console.error(err); app.exit(1); });

async function main() {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-icon-'));
  fs.writeFileSync(path.join(scratch, 'icon.svg'), phoneDrawing(fs.readFileSync(SOURCE, 'utf8')));
  fs.writeFileSync(path.join(scratch, 'icon.html'), `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;width:1024px;height:1024px;background:#080808}
    img{display:block;width:1024px;height:1024px}
  </style><img src="icon.svg">`);
  const win = new BrowserWindow({
    width: 1024, height: 1024, x: -4000, y: 0, show: false, frame: false,
    skipTaskbar: true, webPreferences: { backgroundThrottling: false },
  });
  win.showInactive();
  await win.loadFile(path.join(scratch, 'icon.html'));
  await new Promise((r) => setTimeout(r, 400));
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });
  const full = path.join(scratch, 'full.png');
  fs.writeFileSync(full, image.toPNG());
  win.destroy();
  execFileSync('sips', ['-z', String(SIZE), String(SIZE), full, '--out', OUT], { stdio: 'ignore' });
  fs.rmSync(scratch, { recursive: true, force: true });
  console.log(`main/phone-icon.png  ${SIZE}x${SIZE}`);
  app.exit(0);
}
