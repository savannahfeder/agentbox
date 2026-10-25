// `npm run fresh` ONLY WORKED ON A MAC (QA, 2026-10-23).
//
// On Linux it printed "No packaged Agentbox found... Looked in /Applications,
// ~/Applications and release/" and stopped, because it looked for `Astral.app`
// bundles and nothing else. There is no bundle to find on Linux: the app is run
// from the checkout there. The ⌘K row "Open Agentbox as a new user" has always
// been able to do that — `relaunchCommand` in main/fresh-user.mjs hands the app
// directory back to Electron for a copy that is not packaged — so the terminal
// command was the only half that could not.
//
// Now it has the same two ways in, in the same order: a packaged bundle when
// there is one, because that is the app somebody downloads, and this checkout
// through Electron's own cli when there is not. The cli rather than
// node_modules/electron/dist/electron, because Electron 43 downloads that
// binary on the first run (scripts/linux-launcher.mjs, same reason).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { freshUserTarget } from '../scripts/fresh-user-target.mjs';

let repo;
let home;

/** A checkout with Electron installed, as `npm install` leaves one. */
function withElectron() {
  const dir = path.join(repo, 'node_modules', 'electron');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"electron","version":"43.0.0","main":"index.js"}');
  fs.writeFileSync(path.join(dir, 'index.js'), '');
  fs.writeFileSync(path.join(dir, 'cli.js'), '');
  return path.join(dir, 'cli.js');
}

/** A packed bundle, with the asar whose mtime says when it was built. */
function bundle(at, builtAt) {
  fs.mkdirSync(path.join(at, 'Contents', 'MacOS'), { recursive: true });
  fs.mkdirSync(path.join(at, 'Contents', 'Resources'), { recursive: true });
  fs.writeFileSync(path.join(at, 'Contents', 'MacOS', 'Agentbox'), '', { mode: 0o755 });
  const asar = path.join(at, 'Contents', 'Resources', 'app.asar');
  fs.writeFileSync(asar, '');
  fs.utimesSync(asar, builtAt / 1000, builtAt / 1000);
  return path.join(at, 'Contents', 'MacOS', 'Agentbox');
}

function built() {
  fs.mkdirSync(path.join(repo, 'renderer', 'dist'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'renderer', 'dist', 'index.html'), '<html></html>');
}

beforeEach(() => {
  // THE REAL PATH, because a Mac's temp dir is reached through a symlink
  // (`/var/folders/...`, where `/var` is `/private/var`) and `electronCliIn`
  // resolves the cli through `createRequire`, which hands back the resolved
  // path. Comparing that with a path built from the symlinked name fails on a
  // Mac and passes everywhere else.
  repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fresh-target-repo-')));
  home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fresh-target-home-')));
});

afterEach(() => {
  fs.rmSync(repo, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
});

describe('npm run fresh opens a new user without a mac bundle', () => {
  it('opens this checkout through Electron when nothing is packed', () => {
    const cli = withElectron();
    built();
    const target = freshUserTarget({ repo, env: {}, home, node: '/usr/bin/node' });
    expect(target).toEqual({
      kind: 'checkout',
      bin: '/usr/bin/node',
      args: [cli, repo],
      app: repo,
      needsBuild: false,
    });
  });

  it('says the screen has not been built, rather than opening an empty window', () => {
    withElectron();
    expect(freshUserTarget({ repo, env: {}, home }).needsBuild).toBe(true);
    built();
    expect(freshUserTarget({ repo, env: {}, home }).needsBuild).toBe(false);
  });

  it('still prefers a packaged bundle, and the newest one, because that is what people download', () => {
    withElectron();
    built();
    const older = bundle(path.join(repo, 'release', 'mac-arm64', 'Astral.app'), Date.now() - 3_600_000);
    const newer = bundle(path.join(repo, 'release', 'mac-universal', 'Astral.app'), Date.now() - 60_000);
    const target = freshUserTarget({ repo, env: {}, home });
    expect(target.kind).toBe('app');
    expect(target.bin).toBe(newer);
    expect(target.bin).not.toBe(older);
    expect(target.args).toEqual([]);
    expect(target.at).toBeGreaterThan(0);
  });

  it('honours ASTRAL_APP, including a side build named after itself', () => {
    withElectron();
    const side = path.join(home, 'Agentbox Rest.app');
    fs.mkdirSync(path.join(side, 'Contents', 'MacOS'), { recursive: true });
    fs.writeFileSync(path.join(side, 'Contents', 'MacOS', 'Agentbox Rest'), '', { mode: 0o755 });
    const target = freshUserTarget({ repo, env: { ASTRAL_APP: side }, home });
    expect(target.kind).toBe('app');
    expect(target.bin).toBe(path.join(side, 'Contents', 'MacOS', 'Agentbox Rest'));
  });

  it('names both ways in when there is neither', () => {
    const target = freshUserTarget({ repo, env: {}, home });
    expect(target.kind).toBe('none');
    expect(target.why).toMatch(/no packaged Agentbox/);
    expect(target.why).toMatch(/no Electron in this checkout/);
    expect(target.why).toMatch(/npm install/);
  });

  it('is what the command runs, arguments and all', () => {
    const here = path.dirname(new URL(import.meta.url).pathname);
    const script = fs.readFileSync(path.join(here, '..', 'scripts', 'fresh-user.mjs'), 'utf8');
    expect(script).toMatch(/freshUserTarget\(\{ repo \}\)/);
    // The arguments are the half that is easy to drop, and dropping them opens
    // Electron's own default window instead of this app.
    expect(script).toMatch(/spawn\(found\.bin, found\.args,/);
    expect(script).toMatch(/found\.kind === 'none'/);
    expect(script).not.toMatch(/No packaged Agentbox found/);
  });
});
