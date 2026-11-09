// A FRESH CLONE ON LINUX GOT NO LAUNCHER AT ALL (QA, 2026-10-23).
//
// The README promises that `npm install` puts `agentbox` on `~/.local/bin` and
// adds the app to the launcher. On a fresh clone with npm 11 it did neither,
// and `which agentbox` answered nothing.
//
// WHY. Electron 43 has no install script. Its binary is downloaded by
// `require('electron')` on the first run instead (read in the published
// electron 43.8.3 tarball: `index.js` calls `install.js` when
// `dist/<path.txt>` is missing), so when `npm install` finishes there is no
// `node_modules/electron/dist` yet. The launcher install asked for exactly that
// file, did not find it, and returned `{ changed: false }` without a word. The
// QA box only had a launcher because Electron had already been run there once.
//
// The command is written BEFORE that binary exists now, because it runs
// Electron's own cli, which is the thing that fetches it. A launcher that
// genuinely cannot be written says why at install time.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { installLinuxLauncher } from '../scripts/linux-launcher.mjs';
import { nameSlug } from '../shared/product-name.mjs';

let home;
let appDir;

/** A clone as npm leaves it: the electron package, and no binary under dist. */
function clone({ withCli = true } = {}) {
  const dir = path.join(appDir, 'node_modules', 'electron');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"electron","version":"43.0.0"}');
  if (withCli) fs.writeFileSync(path.join(dir, 'cli.js'), '');
  return path.join(dir, 'cli.js');
}

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'fresh-clone-home-'));
  appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fresh-clone-app-'));
});

afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(appDir, { recursive: true, force: true });
});

describe('a fresh clone on linux gets an app launcher', () => {
  it('writes the command when Electron has no binary downloaded yet', () => {
    const cli = clone();
    expect(fs.existsSync(path.join(appDir, 'node_modules', 'electron', 'dist'))).toBe(false);

    const result = installLinuxLauncher({
      appDir, home, platform: 'linux', env: {}, electronCli: cli, node: process.execPath,
    });

    expect(result.changed).toBe(true);
    expect(result.why).toBe(null);
    expect(result.command).toBe(path.join(home, '.local', 'bin', nameSlug));
    expect(fs.existsSync(result.command)).toBe(true);
    expect(fs.existsSync(result.file)).toBe(true);
    const text = fs.readFileSync(result.command, 'utf8');
    expect(text).toContain(cli);
    expect(text).toContain(appDir);
    // Never the dist binary, which is the path that is not there yet.
    expect(text).not.toContain(path.join('dist', 'electron'));
  });

  it('runs the app through that command, with the node the install was run with', () => {
    const cli = clone();
    // Stands in for electron's cli: it says what it was handed, which is what
    // the real one passes on to Electron.
    fs.writeFileSync(cli, 'console.log(`cli ${process.argv.slice(2).join(" ")}`);\n');
    const { command } = installLinuxLauncher({
      appDir, home, platform: 'linux', env: {}, electronCli: cli, node: process.execPath,
    });
    const said = execFileSync(command, ['--inbox'], { encoding: 'utf8', env: { PATH: '/nonexistent' } });
    expect(said.trim()).toBe(`cli ${appDir} --inbox`);
  });

  it('falls back to the node on PATH when the one it was installed with has gone', () => {
    const cli = clone();
    fs.writeFileSync(cli, 'console.log(`cli ${process.argv.slice(2).join(" ")}`);\n');
    // An nvm upgrade moves node out from under a path written weeks ago. The
    // desktop session's PATH is the second chance, not the first: a session that
    // read ~/.profile at login may have no nvm folder on it at all
    // (tests/a-linux-launcher-start-reads-the-login-shells-path).
    const stubs = fs.mkdtempSync(path.join(os.tmpdir(), 'fresh-clone-path-'));
    fs.writeFileSync(path.join(stubs, 'node'), `#!/bin/sh\nexec ${process.execPath} "$@"\n`, { mode: 0o755 });
    const { command } = installLinuxLauncher({
      appDir,
      home,
      platform: 'linux',
      env: {},
      electronCli: cli,
      node: path.join(appDir, 'gone', 'node'),
    });
    const said = execFileSync(command, [], { encoding: 'utf8', env: { PATH: stubs } });
    expect(said.trim()).toBe(`cli ${appDir}`);
    fs.rmSync(stubs, { recursive: true, force: true });
  });

  it('says why when there is no Electron package to run', () => {
    clone({ withCli: false });
    const result = installLinuxLauncher({
      appDir,
      home,
      platform: 'linux',
      env: {},
      electronCli: path.join(appDir, 'node_modules', 'electron', 'cli.js'),
      node: process.execPath,
    });
    expect(result.changed).toBe(false);
    expect(result.why).toMatch(/Electron package is not installed/);
    expect(fs.existsSync(path.join(home, '.local', 'bin', nameSlug))).toBe(false);
  });

  it('is what the install prints, so a missing launcher is never silent', () => {
    const here = path.dirname(new URL(import.meta.url).pathname);
    const after = fs.readFileSync(path.join(here, '..', 'scripts', 'after-install.mjs'), 'utf8');
    expect(after).toMatch(/no app launcher was written: \$\{why\}/);
    expect(after).toMatch(/this checkout is in the app launcher/);
  });
});
