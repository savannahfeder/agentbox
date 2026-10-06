// A COPY RUN FROM SOURCE SAYS AGENTBOX, NOT ELECTRON.
//
// Asked before launch (w-db6f5e331e): "For the desktop app, rather than saying
// Electron, we'd also want it to say Agentbox with our branding."
//
// What was measured. The downloadable build was already right: electron-builder
// writes productName "Agentbox" and build/icon.icns into its bundle. But every
// copy started with `npm start`, `npm run app` or `npm run dev`, which is how
// the team runs it every day and what the README tells people to do, launches
// node_modules/electron/dist/Electron.app as it was installed: Info.plist
// CFBundleName "Electron", icon electron.icns, so the menu bar, the Dock, ⌘Tab
// and the About box all said Electron with Electron's atom. Nothing in the
// repository renamed it, and `app.setName` does not reach the menu bar title.
//
// That bundle is signed ad hoc (codesign: Signature=adhoc, no team), so
// re-signing it ad hoc after the edit is what keeps it launchable and changes
// nothing a person granted to a real identity.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { brandElectron } from '../scripts/brand-electron.mjs';

const ICON = new URL('../build/icon.icns', import.meta.url).pathname;
const read = (plist, key) => execFileSync('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', plist], { encoding: 'utf8' }).trim();

let dir;
let app;
let plist;
let calls;
const run = (cmd, args) => { calls.push([cmd, ...args]); };

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-electron-'));
  app = path.join(dir, 'Electron.app');
  fs.mkdirSync(path.join(app, 'Contents', 'Resources'), { recursive: true });
  plist = path.join(app, 'Contents', 'Info.plist');
  fs.writeFileSync(plist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>Electron</string>
<key>CFBundleDisplayName</key><string>Electron</string>
<key>CFBundleIdentifier</key><string>com.github.Electron</string>
<key>CFBundleIconFile</key><string>electron.icns</string>
</dict></plist>`);
  fs.writeFileSync(path.join(app, 'Contents', 'Resources', 'electron.icns'), 'the atom');
  calls = [];
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('the bundle a from-source run launches', () => {
  it('is named Agentbox in the menu bar and the Dock, and wears the Agentbox icon', () => {
    const r = brandElectron({ app, run, platform: 'darwin' });
    expect(r.changed).toBe(true);
    expect(read(plist, 'CFBundleName')).toBe('Agentbox');
    expect(read(plist, 'CFBundleDisplayName')).toBe('Agentbox');
    const icon = path.join(app, 'Contents', 'Resources', read(plist, 'CFBundleIconFile'));
    expect(fs.readFileSync(icon).equals(fs.readFileSync(ICON))).toBe(true);
  });

  it('keeps the bundle id, so nothing keyed to it moves', () => {
    brandElectron({ app, run, platform: 'darwin' });
    expect(read(plist, 'CFBundleIdentifier')).toBe('com.github.Electron');
  });

  it('re-signs it ad hoc once, after the edit', () => {
    brandElectron({ app, run, platform: 'darwin' });
    const signs = calls.filter((c) => c[0] === '/usr/bin/codesign');
    expect(signs).toEqual([['/usr/bin/codesign', '--force', '--deep', '--sign', '-', app]]);
  });

  it('does nothing the second time, so a launch does not re-sign every time', () => {
    brandElectron({ app, run, platform: 'darwin' });
    calls = [];
    expect(brandElectron({ app, run, platform: 'darwin' }).changed).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe('what it must never do', () => {
  it('never stops a launch: a missing Electron is not an error', () => {
    expect(() => brandElectron({ app: path.join(dir, 'nowhere.app'), run, platform: 'darwin' })).not.toThrow();
    expect(brandElectron({ app: path.join(dir, 'nowhere.app'), run, platform: 'darwin' }).changed).toBe(false);
  });

  it('puts the bundle back as it was when signing fails', () => {
    const failing = (cmd) => { if (cmd === '/usr/bin/codesign') throw new Error('no'); };
    expect(brandElectron({ app, run: failing, platform: 'darwin' }).changed).toBe(false);
    expect(read(plist, 'CFBundleName')).toBe('Electron');
    expect(read(plist, 'CFBundleIconFile')).toBe('electron.icns');
    expect(fs.existsSync(path.join(app, 'Contents', 'Resources', 'agentbox.icns'))).toBe(false);
  });

  it('leaves other platforms alone', () => {
    expect(brandElectron({ app, run, platform: 'linux' }).changed).toBe(false);
    expect(read(plist, 'CFBundleName')).toBe('Electron');
  });

  it('runs before Electron on every from-source launch', () => {
    const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(pkg.scripts.start).toMatch(/brand-electron\.mjs && electron \./);
    expect(pkg.scripts.app).toMatch(/brand-electron\.mjs && electron \./);
    const dev = fs.readFileSync(new URL('../scripts/dev.mjs', import.meta.url), 'utf8');
    expect(dev).toMatch(/brandElectron\(/);
  });

  it('has an About box that names Agentbox and its version, not Electron 43', () => {
    const main = fs.readFileSync(new URL('../main/main.mjs', import.meta.url), 'utf8');
    expect(main).toMatch(/app\.setAboutPanelOptions\(\{ applicationName: NAME, applicationVersion: app\.getVersion\(\), version: '' \}\)/);
  });

  it('never reaches the npm package or the downloadable build', () => {
    const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(pkg.files.join(' ')).not.toMatch(/brand-electron/);
    expect(pkg.build.files.join(' ')).not.toMatch(/brand-electron/);
  });
});
