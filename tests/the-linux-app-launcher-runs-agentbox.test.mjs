// The launcher entry ran Electron by its path in the checkout, and the only
// thing that wrote the entry was `npm start`. Nobody opens the app that way.
// Measured 2026-10-07: Omarchy's own entries (hype, granola, grok-bot) use
// Exec=<command>, and this session's PATH includes ~/.local/bin. The entry
// has to run that command. `npm start` is not what installs it. The published
// browser package must not install it either.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installLinuxLauncher } from '../scripts/linux-launcher.mjs';
import { defaultStoreRoot } from '../main/store/home.mjs';
import { Name, nameSlug } from '../shared/product-name.mjs';

const repo = path.join(path.dirname(new URL(import.meta.url).pathname), '..');

let home;
let appDir;
let electron;

function desktopFields(text) {
  const fields = {};
  for (const line of text.split('\n')) {
    const at = line.indexOf('=');
    if (at > 0) fields[line.slice(0, at)] = line.slice(at + 1);
  }
  return fields;
}

function entryPath(dir) {
  return path.join(dir, 'applications', `${nameSlug}.desktop`);
}

function commandPath(dir) {
  return path.join(dir, '.local', 'bin', nameSlug);
}

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'linux-launcher-home-'));
  appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linux-launcher-app-'));
  electron = path.join(appDir, 'electron');
  fs.writeFileSync(electron, '');
  fs.mkdirSync(path.join(appDir, 'docs', 'readme'), { recursive: true });
  fs.writeFileSync(path.join(appDir, 'docs', 'readme', 'icon.svg'), '<svg/>');
});

afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(appDir, { recursive: true, force: true });
});

describe('the linux app launcher runs agentbox', () => {
  it('writes a command on ~/.local/bin and a desktop entry that runs it', () => {
    const result = installLinuxLauncher({ appDir, home, platform: 'linux', env: {}, electron });
    const file = entryPath(path.join(home, '.local', 'share'));
    const command = commandPath(home);
    expect(result).toEqual({ changed: true, file, command });
    const text = fs.readFileSync(file, 'utf8');
    expect(text.startsWith('[Desktop Entry]\n')).toBe(true);
    expect(text.endsWith('\n')).toBe(true);
    const fields = desktopFields(text);
    expect(fields.Version).toBe('1.0');
    expect(fields.Type).toBe('Application');
    expect(fields.Name).toBe(Name);
    expect(fields.Comment).toBe('Inbox for Claude Code and Codex');
    expect(fields.Exec).toBe(nameSlug);
    expect(fields.TryExec).toBe(nameSlug);
    expect(fields.Path).toBeUndefined();
    expect(fields.Exec).not.toContain(electron);
    expect(fields.Exec).not.toContain(appDir);
    expect(fields.Icon).toBe(path.join(appDir, 'docs', 'readme', 'icon.svg'));
    expect(fields.Terminal).toBe('false');
    expect(fields.StartupNotify).toBe('true');
    expect(fields.StartupWMClass).toBe(nameSlug);
    expect(fields.Categories).toBe('Development;');
    expect(fs.statSync(command).mode & 0o111).not.toBe(0);
    expect(fs.readFileSync(command, 'utf8')).toBe(`#!/bin/sh\nexec '${electron}' '${appDir}' "$@"\n`);
    const store = defaultStoreRoot({ home, platform: 'linux', env: {} });
    expect(file.startsWith(store + path.sep)).toBe(false);
    expect(command.startsWith(store + path.sep)).toBe(false);
  });

  it('honours an absolute XDG_DATA_HOME for the entry, and keeps the command on ~/.local/bin', () => {
    const xdg = fs.mkdtempSync(path.join(os.tmpdir(), 'linux-launcher-xdg-'));
    try {
      const absolute = installLinuxLauncher({
        appDir, home, platform: 'linux', env: { XDG_DATA_HOME: xdg }, electron,
      });
      expect(absolute.file).toBe(entryPath(xdg));
      expect(absolute.command).toBe(commandPath(home));
      expect(fs.existsSync(entryPath(path.join(home, '.local', 'share')))).toBe(false);

      for (const given of ['   ', 'relative/data', 'share']) {
        const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'linux-launcher-home-'));
        try {
          const result = installLinuxLauncher({
            appDir, home: fresh, platform: 'linux', env: { XDG_DATA_HOME: given }, electron,
          });
          expect(result.file).toBe(entryPath(path.join(fresh, '.local', 'share')));
          expect(result.command).toBe(commandPath(fresh));
        } finally {
          fs.rmSync(fresh, { recursive: true, force: true });
        }
      }
    } finally {
      fs.rmSync(xdg, { recursive: true, force: true });
    }
  });

  it('quotes a checkout path that contains a space or a quote', () => {
    const spaced = fs.mkdtempSync(path.join(os.tmpdir(), 'linux launcher '));
    const bin = path.join(spaced, 'electron bin');
    const quoted = path.join(spaced, "o'brien");
    fs.mkdirSync(quoted, { recursive: true });
    fs.writeFileSync(bin, '');
    try {
      const result = installLinuxLauncher({
        appDir: quoted, home, platform: 'linux', env: {}, electron: bin,
      });
      const script = fs.readFileSync(result.command, 'utf8');
      expect(script).toBe(`#!/bin/sh\nexec '${bin}' '${quoted.replaceAll("'", `'\\''`)}' "$@"\n`);
      expect(desktopFields(fs.readFileSync(result.file, 'utf8')).Exec).toBe(nameSlug);
    } finally {
      fs.rmSync(spaced, { recursive: true, force: true });
    }
  });

  it('omits Icon when the checkout has no icon file', () => {
    fs.rmSync(path.join(appDir, 'docs', 'readme', 'icon.svg'));
    const result = installLinuxLauncher({ appDir, home, platform: 'linux', env: {}, electron });
    const fields = desktopFields(fs.readFileSync(result.file, 'utf8'));
    expect(fields.Icon).toBeUndefined();
    expect(fs.readFileSync(result.file, 'utf8')).not.toMatch(/^Icon=/m);
  });

  it('leaves both files alone when a second run would write the same command', () => {
    const first = installLinuxLauncher({ appDir, home, platform: 'linux', env: {}, electron });
    const desktopBefore = fs.statSync(first.file);
    const commandBefore = fs.statSync(first.command);
    const second = installLinuxLauncher({ appDir, home, platform: 'linux', env: {}, electron });
    expect(second).toEqual({ changed: false, file: first.file, command: first.command });
    expect(fs.statSync(first.file).mtimeMs).toBe(desktopBefore.mtimeMs);
    expect(fs.statSync(first.command).mtimeMs).toBe(commandBefore.mtimeMs);
  });

  it('rewrites the command when the electron binary moves, and the entry still runs its name', () => {
    installLinuxLauncher({ appDir, home, platform: 'linux', env: {}, electron });
    const moved = path.join(appDir, 'electron-moved');
    fs.writeFileSync(moved, '');
    const result = installLinuxLauncher({ appDir, home, platform: 'linux', env: {}, electron: moved });
    expect(result.changed).toBe(true);
    expect(fs.readFileSync(result.command, 'utf8')).toBe(`#!/bin/sh\nexec '${moved}' '${appDir}' "$@"\n`);
    expect(desktopFields(fs.readFileSync(result.file, 'utf8')).Exec).toBe(nameSlug);
  });

  it('does not inherit XDG_DATA_HOME when a caller forgets env', () => {
    const xdg = fs.mkdtempSync(path.join(os.tmpdir(), 'linux-launcher-real-xdg-'));
    const previous = process.env.XDG_DATA_HOME;
    process.env.XDG_DATA_HOME = xdg;
    try {
      const result = installLinuxLauncher({ appDir, home, platform: 'linux', electron });
      expect(result.file).toBe(entryPath(path.join(home, '.local', 'share')));
      expect(fs.existsSync(entryPath(xdg))).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.XDG_DATA_HOME;
      else process.env.XDG_DATA_HOME = previous;
      fs.rmSync(xdg, { recursive: true, force: true });
    }
  });
});

describe('what the launcher install must never do', () => {
  it('writes nothing on darwin or win32, even when XDG_DATA_HOME is set', () => {
    const xdg = fs.mkdtempSync(path.join(os.tmpdir(), 'linux-launcher-other-'));
    try {
      for (const platform of ['darwin', 'win32']) {
        const result = installLinuxLauncher({
          appDir, home, platform, env: { XDG_DATA_HOME: xdg }, electron,
        });
        expect(result).toEqual({ changed: false, file: null, command: null });
      }
      expect(fs.existsSync(entryPath(xdg))).toBe(false);
      expect(fs.existsSync(commandPath(home))).toBe(false);
    } finally {
      fs.rmSync(xdg, { recursive: true, force: true });
    }
  });

  it('writes nothing when the electron binary is missing, and a failure does not throw', () => {
    const missing = installLinuxLauncher({
      appDir, home, platform: 'linux', env: {}, electron: path.join(appDir, 'no-electron'),
    });
    expect(missing).toEqual({ changed: false, file: null, command: null });
    expect(fs.existsSync(entryPath(path.join(home, '.local', 'share')))).toBe(false);
    expect(fs.existsSync(commandPath(home))).toBe(false);

    const blocker = path.join(home, 'not-a-directory');
    fs.writeFileSync(blocker, 'x');
    expect(() => installLinuxLauncher({
      appDir, home: path.join(blocker, 'home'), platform: 'linux', env: {}, electron,
    })).not.toThrow();
    expect(installLinuxLauncher({
      appDir, home: path.join(blocker, 'home'), platform: 'linux', env: {}, electron,
    })).toEqual({ changed: false, file: null, command: null });
  });

  it('is installed with the checkout, and never by npm start or the browser package', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
    expect(pkg.scripts.start).not.toMatch(/linux-launcher/);
    expect(pkg.scripts.app).not.toMatch(/linux-launcher/);
    expect(pkg.scripts.postinstall).toBe('node scripts/after-install.mjs');
    expect(pkg.scripts.serve).not.toMatch(/linux-launcher/);
    expect(pkg.files.join('\n')).not.toMatch(/linux-launcher/);
    expect(pkg.build.files.join('\n')).not.toMatch(/linux-launcher/);
    const bin = fs.readFileSync(path.join(repo, 'bin', 'agentbox.mjs'), 'utf8');
    const after = fs.readFileSync(path.join(repo, 'scripts', 'after-install.mjs'), 'utf8');
    const dev = fs.readFileSync(path.join(repo, 'scripts', 'dev.mjs'), 'utf8');
    const main = fs.readFileSync(path.join(repo, 'main', 'main.mjs'), 'utf8');
    expect(bin).not.toMatch(/linux-launcher/);
    expect(dev).not.toMatch(/linux-launcher/);
    expect(after).toMatch(/linux-launcher\.mjs/);
    expect(after).toMatch(/existsSync\(launcherPath\)/);
    expect(main).toMatch(/installLinuxLauncher\(\{[^}]*env:\s*process\.env/);
    expect(main).toMatch(/!app\.isPackaged/);
    const readme = fs.readFileSync(path.join(repo, 'README.md'), 'utf8');
    expect(readme).toMatch(/~\/\.local\/bin/);
    expect(readme).toMatch(/\$XDG_DATA_HOME\/applications/);
    expect(readme).not.toMatch(/npm start` on Linux it adds/);
  });
});
