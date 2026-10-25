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
// AND IT IS WRITTEN BEFORE ELECTRON HAS A BINARY (2026-10-24). Electron 43
// dropped its install script: the binary is downloaded by `require('electron')`
// on the first run instead, so `node_modules/electron/dist` does not exist when
// `npm install` finishes. This used to ask for that binary and, not finding it,
// leave without a word, so a fresh clone got NO launcher at all and `which
// agentbox` answered nothing. The command runs Electron's own `cli.js` now,
// which is the thing that fetches the binary, so the first launch off the
// launcher does the download.
//
// THIS MUST NEVER STOP A LAUNCH. Another platform, no Electron package at all,
// or a directory that cannot be created are reasons to let Electron start as it
// is. They are reasons to say WHY, though: the skip comes back as `why` and the
// install prints it, because a launcher that silently did not happen is how
// this was missed for a fortnight.
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

function bundledElectronCli() {
  try {
    const require = createRequire(import.meta.url);
    const cli = require.resolve('electron/cli.js');
    return fs.existsSync(cli) ? cli : null;
  } catch {
    return null;
  }
}

// A single-quoted shell word. The command is a script on PATH; the desktop
// entry never carries the checkout path.
function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

// The node that installed this is named, not looked up, because the desktop
// session's PATH is not the terminal's: a session that read ~/.profile at login
// has no nvm folder on it (tests/a-linux-launcher-start-reads-the-login-shells-path).
// PATH is the fallback for the one case the name is wrong, which is an nvm
// upgrade moving node out from under it.
function commandScript(cli, appDir, node) {
  return [
    '#!/bin/sh',
    '# Electron downloads its binary on the first run, so this goes through its own cli.',
    `node=${shellQuote(node)}`,
    '[ -x "$node" ] || node=node',
    `exec "$node" ${shellQuote(cli)} ${shellQuote(appDir)} "$@"`,
    '',
  ].join('\n');
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

const skipped = (why) => ({ changed: false, file: null, command: null, why });

// A linked worktree (a task folder) has a `.git` FILE pointing at the primary
// checkout; a primary checkout has a `.git` DIRECTORY. We never follow a task
// folder onto the launcher, so a worker's `npm install` cannot make the next
// launch run its unreviewed branch as the full app. No subprocess: the kind of
// `.git` is the whole answer.
function isLinkedWorktree(dir) {
  try { return fs.lstatSync(path.join(dir, '.git')).isFile(); } catch { return false; }
}

/**
 * Install the launcher command and the XDG desktop entry that runs it.
 *  Returns { changed, file, command, why }. Both paths are null when nothing is
 *  installed, and `why` then says what stopped it. The command is ~/.local/bin,
 *  which is on the desktop session PATH. The entry is
 *  $XDG_DATA_HOME/applications. */
export function installLinuxLauncher({
  appDir = ROOT,
  home = os.homedir(),
  platform = process.platform,
  env = {},
  electronCli,
  node = process.execPath,
} = {}) {
  try {
    // `why` is for a Linux machine that should have had a launcher and did not.
    // A Mac is not a machine with a missing launcher, so it has nothing to say.
    if (platform !== 'linux') return skipped(null);
    if (isLinkedWorktree(appDir)) return skipped('this folder is a git worktree, and only the main checkout goes on the launcher');
    const cli = electronCli === undefined
      ? bundledElectronCli()
      : (fs.existsSync(electronCli) ? electronCli : null);
    if (!cli) return skipped('the Electron package is not installed here, so there is nothing to run');
    // The applications directory sits next to the store, never inside it.
    // The command does not follow XDG_DATA_HOME: the session PATH has
    // ~/.local/bin, not a data directory.
    const store = defaultStoreRoot({ home, platform: 'linux', env });
    const file = path.join(path.dirname(store), 'applications', `${nameSlug}.desktop`);
    const command = path.join(home, '.local', 'bin', nameSlug);
    const iconPath = path.join(appDir, 'docs', 'readme', 'icon.svg');
    const script = commandScript(cli, appDir, node);
    const text = desktopEntry({ icon: fs.existsSync(iconPath) ? iconPath : null });
    const commandReady = fs.existsSync(command)
      && fs.readFileSync(command, 'utf8') === script
      && (fs.statSync(command).mode & 0o111) !== 0;
    const fileReady = fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text;
    if (commandReady && fileReady) return { changed: false, file, command, why: null };
    // The command first. An entry that names it must not land while the
    // command is still missing.
    fs.mkdirSync(path.dirname(command), { recursive: true });
    fs.writeFileSync(command, script, { mode: 0o755 });
    fs.chmodSync(command, 0o755);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text, { mode: 0o644 });
    return { changed: true, file, command, why: null };
  } catch (err) {
    return skipped(`writing it failed: ${err?.message ?? err}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { changed, why } = installLinuxLauncher({ env: process.env });
  if (changed) console.log(`${Name}: this checkout is in the app launcher.`);
  else if (why) console.log(`${Name}: no app launcher was written: ${why}.`);
}
