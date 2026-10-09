#!/usr/bin/env node
// LINUX INSTALL PUTS THE APP ON THE LAUNCHER.
//
// Measured 2026-10-07. A desktop entry whose Exec is the path to Electron
// inside a checkout is not a launcher: nobody runs that. Omarchy's own
// entries (hype, granola, grok-bot) are Exec=<command>, and the session PATH
// includes ~/.local/bin. This writes that command and a desktop entry that
// runs it. `npm install` of a checkout does this. `npm start` does not.
// Opening the app refreshes it. The published browser package does not carry
// this file, so `npx agentbox-app` does not write one. A Mac launch does not
// write one.
//
// THIS MUST NEVER STOP A LAUNCH. Another platform, a missing Electron, or a
// directory that cannot be created are reasons to say nothing and let
// Electron start as it is.
//
// `env` defaults to an empty object. A caller that wants this machine's
// XDG_DATA_HOME passes process.env. A caller that forgets env cannot inherit
// the real data directory and write the real launcher.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Name, nameSlug } from '../shared/product-name.mjs';
import { defaultStoreRoot } from '../main/store/home.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function bundledElectron() {
  try {
    const require = createRequire(import.meta.url);
    const bin = path.join(path.dirname(require.resolve('electron/package.json')), 'dist', 'electron');
    return fs.existsSync(bin) ? bin : null;
  } catch {
    return null;
  }
}

// A single-quoted shell word. The command is a script on PATH; the desktop
// entry never carries the checkout path.
function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

function commandScript(electron, appDir) {
  return `#!/bin/sh\nexec ${shellQuote(electron)} ${shellQuote(appDir)} "$@"\n`;
}

function desktopEntry({ icon }) {
  const lines = [
    '[Desktop Entry]',
    'Version=1.0',
    `Name=${Name}`,
    'Comment=Inbox for Claude Code and Codex',
    `Exec=${nameSlug}`,
    `TryExec=${nameSlug}`,
    'Terminal=false',
    'Type=Application',
  ];
  if (icon) lines.push(`Icon=${icon}`);
  lines.push('StartupNotify=true', `StartupWMClass=${nameSlug}`, 'Categories=Development;', '');
  return lines.join('\n');
}

const skipped = { changed: false, file: null, command: null };

/**
 * Install the launcher command and the XDG desktop entry that runs it.
 *  Returns { changed, file, command }. Both paths are null when nothing is
 *  installed. The command is ~/.local/bin, which is on the desktop session
 *  PATH. The entry is $XDG_DATA_HOME/applications. */
export function installLinuxLauncher({
  appDir = ROOT,
  home = os.homedir(),
  platform = process.platform,
  env = {},
  electron,
} = {}) {
  try {
    if (platform !== 'linux') return skipped;
    const bin = electron === undefined ? bundledElectron() : (fs.existsSync(electron) ? electron : null);
    if (!bin) return skipped;
    // The applications directory sits next to the store, never inside it.
    // The command does not follow XDG_DATA_HOME: the session PATH has
    // ~/.local/bin, not a data directory.
    const store = defaultStoreRoot({ home, platform: 'linux', env });
    const file = path.join(path.dirname(store), 'applications', `${nameSlug}.desktop`);
    const command = path.join(home, '.local', 'bin', nameSlug);
    const iconPath = path.join(appDir, 'docs', 'readme', 'icon.svg');
    const script = commandScript(bin, appDir);
    const text = desktopEntry({ icon: fs.existsSync(iconPath) ? iconPath : null });
    const commandReady = fs.existsSync(command)
      && fs.readFileSync(command, 'utf8') === script
      && (fs.statSync(command).mode & 0o111) !== 0;
    const fileReady = fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text;
    if (commandReady && fileReady) return { changed: false, file, command };
    // The command first. An entry that names it must not land while the
    // command is still missing.
    fs.mkdirSync(path.dirname(command), { recursive: true });
    fs.writeFileSync(command, script, { mode: 0o755 });
    fs.chmodSync(command, 0o755);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text, { mode: 0o644 });
    return { changed: true, file, command };
  } catch {
    return skipped;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { changed } = installLinuxLauncher({ env: process.env });
  if (changed) console.log(`${Name}: this checkout is in the app launcher.`);
}
