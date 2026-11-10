// A BRANCH THAT CHANGES PACKAGES IS TESTED ON THOSE PACKAGES (w-0240d72133).
//
// A task folder gets its node_modules copied from the app folder, so it holds
// main's packages. w-0240d72133 moved the editor from tiptap 2 to 3, and every
// ship of it ran the tests against tiptap 2: the tiptap 3 test failed with
// "flattenExtensions is not a function" in that folder and passed after
// `npm ci`. Nothing in the ship installed packages. Measured by comparing the
// branch's package-lock.json with the app folder's node_modules/.package-lock.json:
// 37 versions differed, every one a package the branch had upgraded.
//
// The pre-push hook now runs `npm ci` when what is installed is not what the
// lockfile says.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installedDiffers } from '../scripts/lib/installed-matches-the-lockfile.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(root, 'scripts/lib/installed-matches-the-lockfile.mjs');

const lock = (packages) => ({ name: 'x', lockfileVersion: 3, packages: { '': { name: 'x' }, ...packages } });
const installed = (packages) => ({ name: 'x', lockfileVersion: 3, packages });
const at = (version, extra = {}) => ({ version, ...extra });

describe('what counts as installed differently', () => {
  it('a package at another version', () => {
    expect(installedDiffers(
      lock({ 'node_modules/@tiptap/core': at('3.32.1') }),
      installed({ 'node_modules/@tiptap/core': at('2.27.3') }),
    )).toEqual(['node_modules/@tiptap/core: 2.27.3 installed, 3.32.1 in the lockfile']);
  });

  it('a package the lockfile wants and nothing installed', () => {
    expect(installedDiffers(lock({ 'node_modules/a': at('1.0.0') }), installed({}))).toEqual(['node_modules/a: not installed']);
  });

  it('a package installed that the lockfile no longer has', () => {
    expect(installedDiffers(lock({}), installed({ 'node_modules/old': at('1.0.0') }))).toEqual(['node_modules/old: installed, not in the lockfile']);
  });

  it('nothing installed at all', () => {
    expect(installedDiffers(lock({ 'node_modules/a': at('1.0.0') }), null)).toEqual(['nothing installed']);
  });

  it('not an optional package for another platform, which npm never installs', () => {
    expect(installedDiffers(
      lock({ 'node_modules/@esbuild/linux-x64': at('0.21.5', { optional: true }), 'node_modules/a': at('1.0.0') }),
      installed({ 'node_modules/a': at('1.0.0') }),
    )).toEqual([]);
  });

  it('not a matching install', () => {
    const same = { 'node_modules/a': at('1.0.0'), 'node_modules/b/node_modules/a': at('2.0.0') };
    expect(installedDiffers(lock(same), installed(same))).toEqual([]);
  });
});

describe('the script the hook runs', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'installed-')); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  const write = (file, json) => {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), JSON.stringify(json));
  };
  const run = () => spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: 'utf8' });

  it('fails and names the first difference when the install is stale', () => {
    write('package-lock.json', lock({ 'node_modules/@tiptap/core': at('3.32.1') }));
    write('node_modules/.package-lock.json', installed({ 'node_modules/@tiptap/core': at('2.27.3') }));
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('@tiptap/core: 2.27.3 installed, 3.32.1 in the lockfile');
  });

  it('passes when the install matches', () => {
    write('package-lock.json', lock({ 'node_modules/a': at('1.0.0') }));
    write('node_modules/.package-lock.json', installed({ 'node_modules/a': at('1.0.0') }));
    expect(run().status).toBe(0);
  });

  it('passes when there is no lockfile to hold it to', () => {
    expect(run().status).toBe(0);
  });
});

describe('the pre-push hook', () => {
  const hook = fs.readFileSync(path.join(root, 'scripts/hooks/pre-push'), 'utf8');

  it('reinstalls before the tests run when the install is stale', () => {
    const check = hook.indexOf('installed-matches-the-lockfile.mjs');
    expect(check).toBeGreaterThan(0);
    expect(hook.indexOf('npm ci', check)).toBeGreaterThan(check);
    expect(hook.indexOf('node_modules/.bin/vitest $runargs')).toBeGreaterThan(check);
  });
});
