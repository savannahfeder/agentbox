// `npx agentbox-app` FROM A CHECKOUT DID NOT START THE BROWSER (QA, 2026-10-23).
//
// It is the first command in the README and the documented way to run a clone,
// and it either failed with `sh: 1: agentbox: not found` or — on a Linux machine
// with the launcher installed — opened the DESKTOP app, which is a different
// program with a different store.
//
// WHY. npm exec matches the name against this project's own package.json, takes
// its one bin, and runs that bin's NAME through a shell whose PATH starts with
// `node_modules/.bin`. npm links the bins of DEPENDENCIES in there and never
// the project's own, so the shell fell through to the real PATH and found
// either nothing or `~/.local/bin/agentbox`.
//
// MEASURED on a two-line fixture package (name agentbox-app, one bin called
// agentbox) with the registry pointed at a dead port so nothing could be
// downloaded: npm 10.9.9 and npm 11.21.1 both said `sh: 1: agentbox: not
// found`, and both ran the checkout's own bin once the link existed. The real
// npx run is not in this suite, because it reaches for a registry; the link it
// needs is what is checked here.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { linkOwnBin } from '../scripts/link-own-bin.mjs';

const repo = path.join(path.dirname(new URL(import.meta.url).pathname), '..');

let appDir;

/** A checkout as npm leaves it: a package.json with a bin, and a node_modules. */
function checkout({ bin = { agentbox: 'bin/agentbox.mjs' }, mode = 0o644 } = {}) {
  fs.mkdirSync(path.join(appDir, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(appDir, 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({ name: 'agentbox-app', bin }));
  for (const file of Object.values(bin)) {
    const at = path.join(appDir, file);
    fs.mkdirSync(path.dirname(at), { recursive: true });
    fs.writeFileSync(at, '#!/usr/bin/env node\nconsole.log("browser");\n', { mode });
  }
}

const linkAt = (name) => path.join(appDir, 'node_modules', '.bin', name);

beforeEach(() => { appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'own-bin-')); });
afterEach(() => { fs.rmSync(appDir, { recursive: true, force: true }); });

describe('npx from a checkout starts the browser', () => {
  it('links the checkout\'s own command into its own node_modules/.bin', () => {
    checkout();
    const result = linkOwnBin({ appDir, platform: 'linux' });
    expect(result).toEqual({ linked: ['agentbox'], why: null });
    // Relative, so a checkout that is moved or copied still resolves.
    expect(fs.readlinkSync(linkAt('agentbox'))).toBe(path.join('..', '..', 'bin', 'agentbox.mjs'));
    expect(fs.existsSync(linkAt('agentbox'))).toBe(true);
    // npm exec runs the name through a shell, so the exec bit is as
    // load-bearing as the link: without it the shell says Permission denied.
    expect(fs.statSync(path.join(appDir, 'bin', 'agentbox.mjs')).mode & 0o111).not.toBe(0);
    expect(execFileSync(linkAt('agentbox'), { encoding: 'utf8' }).trim()).toBe('browser');
  });

  it('links every bin the package names, and leaves a good link alone', () => {
    checkout({ bin: { agentbox: 'bin/agentbox.mjs', 'agentbox-serve': 'bin/serve.mjs' } });
    expect(linkOwnBin({ appDir, platform: 'linux' }).linked).toEqual(['agentbox', 'agentbox-serve']);
    const before = fs.lstatSync(linkAt('agentbox')).mtimeMs;
    expect(linkOwnBin({ appDir, platform: 'linux' }).linked).toEqual(['agentbox', 'agentbox-serve']);
    expect(fs.lstatSync(linkAt('agentbox')).mtimeMs).toBe(before);
  });

  it('replaces a link that points at nothing', () => {
    checkout();
    fs.mkdirSync(path.dirname(linkAt('agentbox')), { recursive: true });
    fs.symlinkSync('../../bin/gone.mjs', linkAt('agentbox'));
    expect(linkOwnBin({ appDir, platform: 'linux' }).linked).toEqual(['agentbox']);
    expect(execFileSync(linkAt('agentbox'), { encoding: 'utf8' }).trim()).toBe('browser');
  });

  it('does nothing where npm has already done it, or where there is nothing to do', () => {
    // An install OF the published package runs its postinstall inside
    // node_modules, where npm links the bin itself.
    const installed = path.join(appDir, 'node_modules', 'agentbox-app');
    fs.mkdirSync(installed, { recursive: true });
    fs.writeFileSync(path.join(installed, 'package.json'), '{"name":"agentbox-app","bin":{"agentbox":"bin/agentbox.mjs"}}');
    expect(linkOwnBin({ appDir: installed, platform: 'linux' })).toEqual({
      linked: [],
      why: 'this copy is installed under node_modules, where npm links the bin itself',
    });

    // Windows gets .cmd and .ps1 shims from npm rather than a symlink, and the
    // browser command is not the documented way in there.
    checkout();
    expect(linkOwnBin({ appDir, platform: 'win32' })).toEqual({ linked: [], why: null });
    expect(fs.existsSync(linkAt('agentbox'))).toBe(false);

    // And nothing here fails an install.
    const nowhere = linkOwnBin({ appDir: path.join(appDir, 'not-a-checkout'), platform: 'linux' });
    expect(nowhere.linked).toEqual([]);
    expect(nowhere.why).toMatch(/failed/);
  });

  it('is run by the install, and is never shipped in the browser package', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
    expect(pkg.bin).toEqual({ agentbox: 'bin/agentbox.mjs' });
    expect(pkg.files.join('\n')).not.toMatch(/link-own-bin/);
    expect(pkg.build.files.join('\n')).not.toMatch(/link-own-bin/);
    const after = fs.readFileSync(path.join(repo, 'scripts', 'after-install.mjs'), 'utf8');
    expect(after).toMatch(/link-own-bin\.mjs/);
    expect(after).toMatch(/linkOwnBin\(\)/);
    // And what that link reaches is the browser, not the desktop app: the
    // doing half with no Electron in it, on a port on this machine.
    const bin = fs.readFileSync(path.join(repo, 'bin', 'agentbox.mjs'), 'utf8');
    expect(bin).toMatch(/bootHeadless/);
    expect(bin).toMatch(/127\.0\.0\.1/);
  });
});
