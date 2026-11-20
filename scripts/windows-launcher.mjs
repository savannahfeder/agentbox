#!/usr/bin/env node
// WINDOWS PUTS THE APP IN THE START MENU, as scripts/linux-launcher.mjs puts it
// on the Linux launcher.
//
// A Start menu shortcut to this checkout's electron.exe, carrying the app's
// AppUserModelID. Windows shows a notification under the shortcut with the same
// id as the app, and groups the taskbar by it. A shortcut made through
// WScript.Shell cannot carry that id, so the shortcut is written by Electron's
// shell.writeShortcutLink, which main/main.mts passes in when the app opens.
// `npm install` runs under plain Node and has no writer, so it adds nothing.
//
// `env` defaults to an empty object, so a caller that forgets it cannot find
// the real Start menu.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Name } from '../shared/product-name.mjs';
import { APP_USER_MODEL_ID } from '../shared/app-user-model-id.mts';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// Windows keeps the case of an environment name but matches it without.
function envValue(env, name) {
  const key = Object.keys(env).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? env[key] : undefined;
}

function isLinkedWorktree(dir) {
  try { return fs.lstatSync(path.join(dir, '.git')).isFile(); } catch { return false; }
}

/** The shortcut's fields, in the shape Electron's shell.writeShortcutLink takes. */
export function shortcutFor({ appDir, electronExe }) {
  const ico = path.join(appDir, 'build', 'icon.ico');
  return {
    target: electronExe,
    args: `"${appDir}"`,
    cwd: appDir,
    description: Name,
    appUserModelId: APP_USER_MODEL_ID,
    ...(fs.existsSync(ico) ? { icon: ico, iconIndex: 0 } : {}),
  };
}

function shortcutReady(file, want, readShortcut) {
  if (!readShortcut || !fs.existsSync(file)) return false;
  try {
    const have = readShortcut(file);
    return ['target', 'args', 'cwd', 'appUserModelId', 'icon'].every((k) => (have?.[k] ?? '') === (want[k] ?? ''));
  } catch {
    return false;
  }
}

/**
 * The Start menu shortcut.
 *  Returns { changed, shortcut, why }: `shortcut` is null when none was
 *  written, and `why` says what stopped it. `writeShortcut` and `readShortcut`
 *  are Electron's shell.writeShortcutLink and shell.readShortcutLink; without a
 *  writer no shortcut is made.
 *
 * @param {{ appDir?: string, platform?: string, env?: Record<string, string | undefined>,
 *   electronExe?: string,
 *   writeShortcut?: (file: string, operation: 'create', options: ReturnType<typeof shortcutFor>) => boolean,
 *   readShortcut?: (file: string) => object }} [options] */
export function installWindowsLauncher({
  appDir = ROOT,
  platform = process.platform,
  env = {},
  electronExe,
  writeShortcut,
  readShortcut,
} = {}) {
  const none = (why) => ({ changed: false, shortcut: null, why });
  try {
    if (platform !== 'win32' || !writeShortcut) return none(null);
    if (isLinkedWorktree(appDir)) return none('this folder is a git worktree, and only the main checkout goes in the Start menu');
    const appData = envValue(env, 'APPDATA');
    if (!appData) return none('APPDATA is not set, so there is no Start menu to add it to');
    if (!electronExe || !fs.existsSync(electronExe)) return none('Electron has no binary here yet');
    const startMenu = path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs');
    const shortcut = path.join(startMenu, `${Name}.lnk`);
    const want = shortcutFor({ appDir, electronExe });
    if (shortcutReady(shortcut, want, readShortcut)) return { changed: false, shortcut, why: null };
    fs.mkdirSync(startMenu, { recursive: true });
    // 'create' overwrites a shortcut already there, so a moved checkout updates it.
    if (!writeShortcut(shortcut, 'create', want)) return none('Windows refused to write the Start menu shortcut');
    return { changed: true, shortcut, why: null };
  } catch (err) {
    return none(`writing it failed: ${err?.message ?? err}`);
  }
}
