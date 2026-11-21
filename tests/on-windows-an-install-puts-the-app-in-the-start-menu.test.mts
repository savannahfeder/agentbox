// On Windows a checkout's `npm install` gave no way to open the app but
// `npm start` from its folder: scripts/after-install.mjs only wrote the Linux
// launcher, and scripts/link-own-bin.mjs returns early on win32. The app never
// set an AppUserModelID either, so Windows grouped its window under Electron's
// and showed its notifications as Electron's. Read from the source on
// 2026-11-14. Now the app sets its id before anything else, and the first
// launch adds a Start menu shortcut carrying that id, written through
// Electron's shell.writeShortcutLink. The install itself writes nothing on
// Windows. Every case here runs on fake folders and a fake writer.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installWindowsLauncher } from '../scripts/windows-launcher.mjs';
import { APP_USER_MODEL_ID } from '../shared/app-user-model-id.mts';
import { Name } from '../shared/product-name.mjs';

const read = (f: string) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');

let root: string;
let appData: string;
let appDir: string;
let exe: string;
let startMenu: string;

type Written = { file: string; operation: string; options: Record<string, unknown> };

/** A stand-in for shell.writeShortcutLink and shell.readShortcutLink, over plain files. */
function fakeShell({ refuse = false, explode = false } = {}) {
  const writes: Written[] = [];
  return {
    writes,
    writeShortcut: (file: string, operation: string, options: Record<string, unknown>) => {
      if (explode) throw new Error('no COM here');
      writes.push({ file, operation, options });
      if (refuse) return false;
      fs.writeFileSync(file, JSON.stringify(options));
      return true;
    },
    readShortcut: (file: string) => JSON.parse(fs.readFileSync(file, 'utf8')),
  };
}

const install = (over: Record<string, unknown> = {}) => installWindowsLauncher({
  appDir, platform: 'win32', env: { APPDATA: appData }, ...over,
});

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-launcher-'));
  appData = path.join(root, 'appdata');
  appDir = path.join(root, 'app');
  startMenu = path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs');
  exe = path.join(appDir, 'node_modules', 'electron', 'dist', 'electron.exe');
  fs.mkdirSync(path.dirname(exe), { recursive: true });
  fs.writeFileSync(exe, '');
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('the Start menu shortcut', () => {
  it('is not made without Electron\'s writer, which an npm install does not have', () => {
    const result = install();
    expect(result.shortcut).toBe(null);
    expect(result.why).toBe(null);
    expect(fs.existsSync(startMenu)).toBe(false);
  });

  it('points electron.exe at this checkout and carries the app\'s id', () => {
    const shell = fakeShell();
    const result = install({ electronExe: exe, ...shell });
    const file = path.join(startMenu, `${Name}.lnk`);
    expect(result.shortcut).toBe(file);
    expect(shell.writes).toEqual([{
      file,
      operation: 'create',
      options: { target: exe, args: `"${appDir}"`, cwd: appDir, description: Name, appUserModelId: APP_USER_MODEL_ID },
    }]);
  });

  it('uses build/icon.ico when the checkout has one', () => {
    const ico = path.join(appDir, 'build', 'icon.ico');
    fs.mkdirSync(path.dirname(ico), { recursive: true });
    fs.writeFileSync(ico, '');
    const shell = fakeShell();
    install({ electronExe: exe, ...shell });
    expect(shell.writes[0].options).toMatchObject({ icon: ico, iconIndex: 0 });
  });

  it('is not written again when it is already right, and is updated in place when not', () => {
    const shell = fakeShell();
    install({ electronExe: exe, ...shell });
    expect(install({ electronExe: exe, ...shell }).changed).toBe(false);
    expect(shell.writes).toHaveLength(1);

    const moved = path.join(root, 'moved');
    fs.mkdirSync(moved);
    install({ appDir: moved, electronExe: exe, ...shell });
    expect(shell.writes).toHaveLength(2);
    expect(shell.writes[1].file).toBe(shell.writes[0].file);
    expect(fs.readdirSync(startMenu)).toEqual([`${Name}.lnk`]);
  });

  it('says why when Electron has no binary, there is no APPDATA, or Windows refuses', () => {
    expect(install({ electronExe: path.join(root, 'none.exe'), ...fakeShell() }).why).toMatch(/no binary/);
    expect(install({ env: { Path: 'C:\Windows' }, electronExe: exe, ...fakeShell() }).why).toMatch(/APPDATA is not set/);
    expect(install({ electronExe: exe, ...fakeShell({ refuse: true }) }).why).toMatch(/refused/);
  });

  it('never throws, even when the writer does', () => {
    const result = install({ electronExe: exe, ...fakeShell({ explode: true }) });
    expect(result.changed).toBe(false);
    expect(result.why).toMatch(/no COM here/);
  });
});

describe('where it runs', () => {
  it('does nothing on a Mac or Linux', () => {
    for (const platform of ['darwin', 'linux']) {
      const shell = fakeShell();
      expect(install({ platform, electronExe: exe, ...shell })).toEqual({ changed: false, shortcut: null, why: null });
      expect(shell.writes).toEqual([]);
    }
    expect(fs.existsSync(appData)).toBe(false);
  });

  it('skips a linked worktree, so a task folder never takes over the Start menu', () => {
    fs.writeFileSync(path.join(appDir, '.git'), 'gitdir: elsewhere');
    const shell = fakeShell();
    const result = install({ electronExe: exe, ...shell });
    expect(result.why).toMatch(/worktree/);
    expect(shell.writes).toEqual([]);
    expect(fs.existsSync(appData)).toBe(false);
  });

  it('finds no real folders when no env is passed', () => {
    const shell = fakeShell();
    const result = installWindowsLauncher({ appDir, platform: 'win32', electronExe: exe, ...shell });
    expect(result.shortcut).toBe(null);
    expect(shell.writes).toEqual([]);
  });
});

describe('the app and the install', () => {
  it('uses the installer\'s app id', () => {
    expect(APP_USER_MODEL_ID).toBe(JSON.parse(read('package.json')).build.appId);
  });

  it('sets the id on Windows before the window is made', () => {
    const main = read('main/main.mts');
    const at = main.indexOf("if (process.platform === 'win32') app.setAppUserModelId(APP_USER_MODEL_ID);");
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(main.indexOf('new BrowserWindow('));
  });

  it('writes the shortcut from a Windows launch run from source, through Electron', () => {
    const main = read('main/main.mts');
    const at = main.indexOf("import('../scripts/windows-launcher.mjs')");
    expect(at).toBeGreaterThan(-1);
    const gate = main.lastIndexOf('if (', at);
    expect(main.slice(gate, at)).toContain("process.platform === 'win32' && !app.isPackaged");
    const call = main.slice(at, main.indexOf('.catch(', at));
    expect(call).toContain('electronExe: process.execPath');
    expect(call).toContain('shell.writeShortcutLink(file, operation, options)');
  });

  it('has the install write nothing on Windows', () => {
    const after = read('scripts/after-install.mjs');
    // No writer at install: a shortcut without the id would split the taskbar.
    expect(after).not.toContain('windows-launcher');
    expect(after).toContain("const dir = process.platform === 'win32' ? null : prebuildsDir();");
    // The script itself starts nothing: no PowerShell, no shell.
    expect(read('scripts/windows-launcher.mjs')).not.toMatch(/child_process|powershell/i);
  });
});
