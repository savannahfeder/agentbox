// AN INSTALL LEAVES THE APP FOLDER FREE TO UPDATE (2026-10-23).
//
// The team app's folder stopped offering "Restart to update" and sat 31
// commits behind main, so a change shipped at 21:14 never reached the app.
// Measured on that Mac: at 20:54:10 the updater fast-forwarded the folder, its
// package install ran scripts/link-own-bin.mjs, and at 20:54:11 that made
// bin/agentbox.mjs executable. Git stored the file as 100644, so
// `git status` read the flip as an edit, and main/source-updater.mjs never
// updates a folder with edits in it. Every update after that was refused.
// The file is stored executable now, so the install finds nothing to change.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { linkOwnBin } from '../scripts/link-own-bin.mjs';

const repo = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
const bins = typeof pkg.bin === 'string' ? [pkg.bin] : Object.values(pkg.bin ?? {});

let dir;
const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();

/** A checkout whose one bin git stores with `mode`, as a clone leaves it. */
function cloneWithBin(mode) {
  git('init', '-q');
  git('config', 'core.fileMode', 'true');
  fs.mkdirSync(path.join(dir, 'bin'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'agentbox-app', bin: { agentbox: 'bin/agentbox.mjs' } }));
  fs.writeFileSync(path.join(dir, 'bin', 'agentbox.mjs'), '#!/usr/bin/env node\n');
  fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules\n');
  git('add', '.');
  git('update-index', `--chmod=${mode === '100755' ? '+x' : '-x'}`, 'bin/agentbox.mjs');
  git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-qm', 'one');
  git('checkout', '-q', '--', '.');
  fs.mkdirSync(path.join(dir, 'node_modules'));
}

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-mode-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('the bins this package names', () => {
  it('are stored executable in git, so the install has nothing to flip', () => {
    expect(bins.length).toBeGreaterThan(0);
    for (const bin of bins) {
      const [mode] = execFileSync('git', ['ls-files', '-s', bin], { cwd: repo, encoding: 'utf8' }).trim().split(' ');
      expect(`${bin} ${mode}`).toBe(`${bin} 100755`);
    }
  });
});

describe('after the install links the bin', () => {
  it('a folder whose bin git stores executable has no edits in it', () => {
    cloneWithBin('100755');
    linkOwnBin({ appDir: dir, platform: 'darwin' });
    expect(git('status', '--porcelain', '--untracked-files=no')).toBe('');
  });
  it('a folder whose bin git stores as plain reads as edited, which is what stopped the updates', () => {
    cloneWithBin('100644');
    linkOwnBin({ appDir: dir, platform: 'darwin' });
    expect(git('status', '--porcelain', '--untracked-files=no')).toBe('M bin/agentbox.mjs');
  });
});
