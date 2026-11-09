// A RELEASE COMMITS ITS OWN VERSION TO MAIN (F-202).
//
// A build of release commit 745f5964 called itself 0.1.19 while the download
// built from it was 0.1.22. `npm run deploy` wrote the version into
// package.json for its own run and put the old one back, and at the end
// printed a line asking somebody to ship the bump by hand (F-147). Nobody did,
// three releases running. Now the release ships the number to main before it
// builds, so the commit it builds from carries it. That push changes nothing a
// test reads, so it must not wait on the whole suite, which a package.json
// change otherwise sets off.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { withVersion, onlyTheVersionMoved } from '../scripts/lib/deploy-rules.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const pkg = `${JSON.stringify({ name: 'agentbox-app', version: '0.1.19', dependencies: { a: '1.0.0' } }, null, 2)}\n`;
const lock = `${JSON.stringify({ name: 'agentbox-app', version: '0.1.19', lockfileVersion: 3, packages: { '': { name: 'agentbox-app', version: '0.1.19' }, 'node_modules/a': { version: '1.0.0' } } }, null, 2)}\n`;

describe('writing the version', () => {
  it('sets package.json and both places in the lockfile, and nothing else', () => {
    expect(JSON.parse(withVersion(pkg, '0.1.23')).version).toBe('0.1.23');
    const l = JSON.parse(withVersion(lock, '0.1.23'));
    expect(l.version).toBe('0.1.23');
    expect(l.packages[''].version).toBe('0.1.23');
    expect(l.packages['node_modules/a'].version).toBe('1.0.0');
    expect(withVersion(pkg, '0.1.19')).toBe(pkg);
  });
});

describe('a change that only moves the version', () => {
  it('is told apart from one that changes anything else in the file', () => {
    expect(onlyTheVersionMoved(pkg, withVersion(pkg, '0.1.23'))).toBe(true);
    expect(onlyTheVersionMoved(lock, withVersion(lock, '0.1.23'))).toBe(true);
    const dep = pkg.replace('"1.0.0"', '"2.0.0"');
    expect(onlyTheVersionMoved(pkg, withVersion(dep, '0.1.23'))).toBe(false);
    expect(onlyTheVersionMoved(lock, lock.replace('"1.0.0"', '"2.0.0"'))).toBe(false);
    expect(onlyTheVersionMoved(pkg, pkg)).toBe(false);
    expect(onlyTheVersionMoved(pkg, 'not json')).toBe(false);
  });

  function repoWith(files) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'version-only-'));
    const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'core.hooksPath=/dev/null', ...a], { cwd: dir, encoding: 'utf8' }).trim();
    git('init', '-q');
    fs.writeFileSync(path.join(dir, 'package.json'), pkg);
    fs.writeFileSync(path.join(dir, 'package-lock.json'), lock);
    fs.writeFileSync(path.join(dir, 'a.mjs'), 'export {};\n');
    git('add', '.'); git('commit', '-qm', 'one');
    const base = git('rev-parse', 'HEAD');
    for (const [f, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), text);
    git('add', '.'); git('commit', '-qm', 'two');
    const ask = spawnSync('node', [path.join(root, 'scripts/lib/only-the-version-moved.mjs'), base, git('rev-parse', 'HEAD')], { cwd: dir });
    return ask.status;
  }

  it('answers yes for a release bump and no for anything more, read from git', () => {
    expect(repoWith({ 'package.json': withVersion(pkg, '0.1.23'), 'package-lock.json': withVersion(lock, '0.1.23') })).toBe(0);
    expect(repoWith({ 'package.json': withVersion(pkg, '0.1.23'), 'a.mjs': 'export const x = 1;\n' })).toBe(1);
    expect(repoWith({ 'package.json': withVersion(pkg.replace('"1.0.0"', '"2.0.0"'), '0.1.23') })).toBe(1);
  });
});

describe('the release and the push', () => {
  const deploy = read('scripts/deploy.mjs');

  it('ships the version to main before it builds, and no longer asks somebody to', () => {
    const shipped = deploy.indexOf('shipTheVersion(version)');
    expect(shipped).toBeGreaterThan(-1);
    expect(shipped).toBeLessThan(deploy.indexOf('building, signing and notarising'));
    expect(shipped).toBeGreaterThan(deploy.indexOf('if (checkOnly) {'));
    expect(deploy).not.toMatch(/Ship a branch setting/);
  });

  it('the push hook lets a version-only push through without the whole suite', () => {
    const hook = read('scripts/hooks/pre-push');
    const asks = hook.indexOf('only-the-version-moved.mjs');
    expect(asks).toBeGreaterThan(-1);
    expect(asks).toBeLessThan(hook.indexOf('it changes what every test depends on'));
  });
});
