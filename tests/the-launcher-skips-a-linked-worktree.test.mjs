// A WORKER'S NPM INSTALL MUST NOT POINT THE LAUNCHER AT ITS OWN BRANCH.
//
// postinstall runs installLinuxLauncher with appDir defaulted to the checkout
// the script sits in, with no check whether that checkout is the person's
// primary one. A worker that ran `npm install` in its task folder (a linked
// git worktree) rewrote ~/.local/bin/agentbox to exec that folder's electron
// on that folder, and main.mjs then refreshed it to the running appDir on
// every from-source Linux launch, so the next launch ran unreviewed branch
// code as the full app. A linked worktree is told apart from a primary
// checkout without a subprocess: its `.git` is a FILE, not a directory.
// Measured here: a call from a dir whose `.git` is a file writes nothing,
// while a primary checkout (`.git` is a directory) and a plain directory
// (no `.git` at all) still install.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installLinuxLauncher } from '../scripts/linux-launcher.mjs';
import { nameSlug } from '../shared/product-name.mjs';

let home;
let appDir;
let electronCli;

const entryPath = (dir) => path.join(dir, 'applications', `${nameSlug}.desktop`);
const commandPath = (dir) => path.join(dir, '.local', 'bin', nameSlug);
const install = () => installLinuxLauncher({ appDir, home, platform: 'linux', env: {}, electronCli, node: process.execPath });

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'worktree-launcher-home-'));
  appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'worktree-launcher-app-'));
  electronCli = path.join(appDir, 'node_modules', 'electron', 'cli.js');
  fs.mkdirSync(path.dirname(electronCli), { recursive: true });
  fs.writeFileSync(electronCli, '');
  fs.mkdirSync(path.join(appDir, 'docs', 'readme'), { recursive: true });
  fs.writeFileSync(path.join(appDir, 'docs', 'readme', 'icon.svg'), '<svg/>');
});

afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(appDir, { recursive: true, force: true });
});

describe('the launcher and a linked worktree', () => {
  it('writes nothing when appDir is a linked worktree (its .git is a file)', () => {
    fs.writeFileSync(path.join(appDir, '.git'), 'gitdir: /somewhere/.git/worktrees/w-1\n');
    const result = install();
    expect(result).toMatchObject({ changed: false, file: null, command: null });
    expect(result.why).toMatch(/worktree/);
    expect(fs.existsSync(commandPath(home))).toBe(false);
    expect(fs.existsSync(entryPath(path.join(home, '.local', 'share')))).toBe(false);
  });

  it('still installs for a primary checkout (its .git is a directory)', () => {
    fs.mkdirSync(path.join(appDir, '.git'));
    const result = install();
    expect(result.changed).toBe(true);
    expect(fs.existsSync(result.command)).toBe(true);
    expect(fs.existsSync(result.file)).toBe(true);
  });

  it('still installs for a plain directory with no .git at all', () => {
    const result = install();
    expect(result.changed).toBe(true);
    expect(fs.existsSync(result.command)).toBe(true);
    expect(fs.existsSync(result.file)).toBe(true);
  });
});
