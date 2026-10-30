// npm 11 ASKS ABOUT INSTALL SCRIPTS NOW, AND NOBODY HAD ANSWERED (QA, 2026-10-23).
//
// `npm install` on npm 11.21.1 ended with "3 packages have install scripts not
// yet covered by allowScripts": node-pty, esbuild and electron-winstaller. The
// field is advisory in that release — the scripts still run and the install
// only prints a list — but npm says a later release will block the ones nobody
// has reviewed (npm-approve-scripts(1), read in the published npm 11.21.1
// tarball). node-pty ships no Linux prebuild, so the day that lands, a clone
// with no answer here has no `pty.node` and no terminal.
//
// So the answer is written down. BY NAME, not pinned to a version: npm's
// matcher reads a bare name as "any version of this package"
// (@npmcli/arborist/lib/script-allowed.js), and a pin would mean re-approving
// every dependency bump before anybody could install this repo.
//
// MEASURED ON A FRESH CLONE, on Linux with npm 11.21.1, which is what the
// finding was waiting on: without this field the install warns "3 packages have
// install scripts not yet covered by allowScripts" and `npm install-scripts ls`
// names electron-winstaller@5.4.0, esbuild@0.21.5 and node-pty@1.1.0; with it,
// the install says nothing and that command says "No packages with unreviewed
// install scripts". Both allowed packages still build: an 81 KB `pty.node` and a
// working esbuild 0.21.5. Denying electron-winstaller costs the install nothing.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repo = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));

describe('an install says which dependencies may run scripts', () => {
  it('allows the two the app needs built', () => {
    // node-pty IS the terminal, and it is built by node-gyp on install. It sits
    // in optionalDependencies because that build is the one that can fail
    // (tests/an-install-with-no-compiler-still-starts); it is still built
    // everywhere it can be, so its script still has to be allowed.
    expect(pkg.allowScripts['node-pty']).toBe(true);
    expect(pkg.optionalDependencies['node-pty']).toBeTruthy();
    // esbuild fetches its own binary, and vite is nothing without it.
    expect(pkg.allowScripts.esbuild).toBe(true);
  });

  it('refuses the one that is only for an installer this repo does not build', () => {
    // electron-winstaller comes in under electron-builder and packs a Windows
    // installer. There is no windows target here, so its script is denied
    // rather than left unreviewed: a denial is silent, an unreviewed package is
    // printed on every install.
    expect(pkg.allowScripts['electron-winstaller']).toBe(false);
    expect(pkg.build.win).toBeUndefined();
    expect(Object.keys(pkg.build)).not.toContain('nsis');
  });

  it('names packages, never versions, so a dependency bump is not a gate', () => {
    for (const [name, allowed] of Object.entries(pkg.allowScripts)) {
      expect(typeof allowed).toBe('boolean');
      // `pkg@1.2.3` and `pkg@latest` are both legal in that field and both
      // wrong here: the first needs re-approving on every bump, the second npm
      // refuses outright.
      expect(name).not.toMatch(/@/);
    }
  });

  it('says in the README what to do when npm names a fourth one', () => {
    const readme = fs.readFileSync(path.join(repo, 'README.md'), 'utf8');
    expect(readme).toMatch(/allowScripts/);
    expect(readme).toMatch(/npm approve-scripts --allow-scripts-pending/);
  });
});
