#!/usr/bin/env node
// A COPY RUN FROM SOURCE SAYS AGENTBOX, NOT ELECTRON (w-db6f5e331e).
//
// `npm start`, `npm run app` and `npm run dev` launch the Electron.app that npm
// put in node_modules, and macOS names a running app after its bundle: the
// menu bar title, the Dock, ⌘Tab and the About box all read CFBundleName and
// the bundle's icon, which say Electron and show its atom. `app.setName` does
// not reach the menu bar title, so the bundle itself is renamed.
//
// The downloadable build never needs this: electron-builder writes the name
// and build/icon.icns into its own bundle. So this script is not in the npm
// package or the build's files, and it only ever touches node_modules.
//
// What it changes, once: CFBundleName and CFBundleDisplayName become the app's
// name, the icon becomes build/icon.icns, the bundle id becomes the app's own,
// and the bundle is re-signed ad hoc, which is how npm's Electron.app was
// signed to begin with. A second run finds nothing to do and signs nothing.
//
// THE BUNDLE ID USED TO BE LEFT ALONE, and the reason given for leaving it is
// the reason it now changes. macOS keys every permission off the bundle id and
// asks a person once per id. Left alone, that id is com.github.Electron, which
// every Electron app ever run from source on that Mac shares, so Agentbox
// inherited an answer somebody gave years ago about something else: macOS took
// every banner it sent, reported success, and drew nothing.
//
// Measured 2026-10-08, and this is the whole of the evidence: a copy of this
// same Electron.app carrying an id macOS had never seen made it ask out loud on
// the very first banner. Nothing else about the copy differed. So the run from
// source takes the id the downloadable build already uses, and one answer in
// System Settings covers both.
//
// THIS MUST NEVER STOP A LAUNCH. A missing Electron, another platform or a
// failed tool are all reasons to say nothing and let Electron start as it is.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { NAME } from '../shared/product-name.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ICON = path.join(ROOT, 'build', 'icon.icns');
const ICON_FILE = 'agentbox.icns';
// package.json is where the downloadable build's id already lives, and two
// copies of it would be two answers to one question.
const APP_ID = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).build.appId;
  } catch { return null; }
})();
const LSREGISTER = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';

function electronApp() {
  try {
    const require = createRequire(import.meta.url);
    return path.join(path.dirname(require.resolve('electron/package.json')), 'dist', 'Electron.app');
  } catch { return null; }
}

const quiet = (cmd, args) => execFileSync(cmd, args, { stdio: 'ignore' });

function plistValue(plist, key) {
  try {
    const text = fs.readFileSync(plist, 'utf8');
    const m = text.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`));
    return m ? m[1] : null;
  } catch { return null; }
}

function setPlistString(plist, key, value) {
  const text = fs.readFileSync(plist, 'utf8');
  const re = new RegExp(`(<key>${key}</key>\\s*<string>)[^<]*(</string>)`);
  if (!re.test(text)) throw new Error(`plist has no ${key}`);
  fs.writeFileSync(plist, text.replace(re, `$1${value}$2`));
}

/**
 * Rename and re-icon the Electron.app a from-source run launches.
 *  `run` is how the signing and LaunchServices tools are called, so a test can
 *  watch them without signing anything. Returns { changed }. */
export function brandElectron({ app = electronApp(), name = NAME, icon = ICON, appId = APP_ID, run = quiet, platform = process.platform } = {}) {
  try {
    if (platform !== 'darwin' || !app) return { changed: false };
    const plist = path.join(app, 'Contents', 'Info.plist');
    if (!fs.existsSync(plist) || !fs.existsSync(icon)) return { changed: false };
    const dest = path.join(app, 'Contents', 'Resources', ICON_FILE);
    const iconSame = fs.existsSync(dest) && fs.readFileSync(dest).equals(fs.readFileSync(icon));
    const done = plistValue(plist, 'CFBundleName') === name
      && plistValue(plist, 'CFBundleDisplayName') === name
      && plistValue(plist, 'CFBundleIconFile') === ICON_FILE
      // A bundle branded before this change has everything else right and the
      // wrong id, so the id alone has to count as work or the fix never
      // reaches the machines that need it most.
      && (!appId || plistValue(plist, 'CFBundleIdentifier') === appId)
      && iconSame;
    if (done) return { changed: false };

    // Kept, so a failed signature puts the bundle back exactly as npm left it
    // rather than leaving an edited bundle with a seal that no longer matches.
    const before = fs.readFileSync(plist);
    try {
      fs.copyFileSync(icon, dest);
      const fields = [['CFBundleName', name], ['CFBundleDisplayName', name], ['CFBundleIconFile', ICON_FILE]];
      if (appId) fields.push(['CFBundleIdentifier', appId]);
      for (const [key, value] of fields) {
        setPlistString(plist, key, value);
      }
      run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', app]);
    } catch (err) {
      fs.writeFileSync(plist, before);
      fs.rmSync(dest, { force: true });
      throw err;
    }
    // The Dock caches a bundle's name and icon; a newer mtime and a fresh
    // registration make it read them again.
    const now = new Date();
    fs.utimesSync(app, now, now);
    try { if (fs.existsSync(LSREGISTER)) run(LSREGISTER, ['-f', app]); } catch { /* the name still changes at next login */ }
    return { changed: true };
  } catch {
    return { changed: false };
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { changed } = brandElectron();
  if (changed) console.log(`${NAME}: renamed this checkout's Electron to ${NAME}, so the menu bar and the Dock say so.`);
}
