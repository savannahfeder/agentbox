// `npx agentbox-app` EXITED 1 AND SAID NOTHING ON LINUX (F-126, QA, 2026-10-28).
//
// node-pty is the terminal, and it is the one package here that has to be
// compiled: its 1.1.0 tarball carries prebuilt binaries for macOS and Windows
// only, so on Linux npm runs `node scripts/prebuild.js || node-gyp rebuild`,
// which needs make and a C++ compiler. A box with neither failed that build,
// and because node-pty was a plain dependency the whole install failed with it:
// three seconds, exit 1, and nothing on the terminal but npm's own notices. The
// app never ran. Installing build-essential on the same box fixed it, which
// nothing anywhere said.
//
// Measured on Debian with npm, no make and no g++ on PATH: as a dependency the
// install exits 1 and prints no line naming node-pty; as an optionalDependency
// the same install exits 0 and leaves node-pty out, and with the toolchain back
// it builds pty.node as before. So the install stops failing, and the one pane
// that needs the compiler says what to install.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadPty, NO_TERMINAL, ptyIsHere } from '../main/pty.mjs';

const repo = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (file) => fs.readFileSync(path.join(repo, file), 'utf8');
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));

describe('an install with no compiler', () => {
  it('is not failed by the one package that needs one', () => {
    expect(pkg.optionalDependencies['node-pty']).toBeTruthy();
    expect(pkg.dependencies['node-pty']).toBeUndefined();
    // The lockfile has to agree, or `npm ci` fails the install all over again.
    expect(lock.packages[''].optionalDependencies['node-pty']).toBe(pkg.optionalDependencies['node-pty']);
    expect(lock.packages['node_modules/node-pty'].optional).toBe(true);
  });

  it('still builds the terminal on a machine that can', () => {
    // Optional is about the failure, not about wanting it less: every install
    // that can compile still gets it, and its install script stays approved.
    expect(pkg.allowScripts['node-pty']).toBe(true);
  });

  it('says what to install rather than a module error', () => {
    const gone = () => { const err = Error("Cannot find module 'node-pty'"); err.code = 'MODULE_NOT_FOUND'; throw err; };
    expect(() => loadPty(gone)).toThrow(NO_TERMINAL);
    expect(NO_TERMINAL).toMatch(/build-essential/);
    expect(ptyIsHere(gone)).toBe(false);
  });

  it('leaves any other failure to load it as it is', () => {
    // A binary built for the wrong architecture is not a missing compiler, and
    // telling somebody to install one would send them the wrong way.
    const broken = () => { throw Error('dlopen failed: wrong ELF class'); };
    expect(() => loadPty(broken)).toThrow(/dlopen failed/);
  });

  it('hands back the backend when it is there', () => {
    const pty = { spawn: () => 'a shell' };
    expect(loadPty(() => pty)).toBe(pty);
    expect(ptyIsHere(() => '/node_modules/node-pty/index.js')).toBe(true);
  });

  it('says it once at the start, where the person is reading', () => {
    // The install may be the npx cache's, built long before and never printed
    // again, so the command itself says it every time it starts without one.
    const bin = read('bin/agentbox.mjs');
    expect(bin).toContain('ptyIsHere');
    expect(bin).toContain('NO_TERMINAL');
  });

  it('does not stop a build that has no node-pty to fix', () => {
    // The build sets the execute bit on node-pty's macOS helper. On a checkout
    // that could not compile it there is nothing to set, and resolving it threw
    // before anything else in the build could run. Run from a folder with no
    // node_modules, which is that machine.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-pty-'));
    fs.copyFileSync(path.join(repo, 'scripts/prepare-terminal.mjs'), path.join(dir, 'prepare-terminal.mjs'));
    const r = spawnSync(process.execPath, [path.join(dir, 'prepare-terminal.mjs')], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/left the terminal alone/);
  });
});
