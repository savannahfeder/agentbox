// WHAT `npm install agentbox` ACTUALLY DOWNLOADS.
//
// Two ways to get this wrong and they fail in opposite directions.
//
// TOO MANY. React, the nine tiptap packages, pdfjs and xterm are all compiled
// INTO renderer/dist at build time, so a copy installed from npm never loads
// one of them. Left in `dependencies` they were 52.5 MB across 21 packages
// downloaded on every install and never run, pdfjs-dist alone being 34.7 MB.
// Nothing fails when that is wrong. It is just slow, for everybody, forever.
//
// TOO FEW, which is the one that actually breaks. Move a package that IS
// needed and this repo keeps working perfectly, because devDependencies are
// installed here; only a stranger's install breaks, on the line that requires
// it. That is a bug you cannot hit on the machine that made it.
//
// So this reads the runtime code and demands the two lists agree. The subtlety
// worth keeping: main/analytics.mjs and main/updater.mjs load theirs with a
// `require()` at the moment of use, not with an import at the top, so a search
// for import statements finds neither. The scan below covers both shapes, and
// posthog-node is the package that proved it needs to.

import { describe, it, expect } from 'vitest';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(fs.readFileSync(path.join(here, 'package.json'), 'utf8'));

/** Every file that runs outside the bundler: the two doors and what they reach. */
function runtimeFiles(dir, out = []) {
  for (const entry of fs.readdirSync(path.join(here, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) runtimeFiles(rel, out);
    else if (/\.(mjs|cjs|js)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

const files = [...runtimeFiles('main'), ...runtimeFiles('shared'), ...runtimeFiles('bin'), ...runtimeFiles('mcp'), 'preload.cjs'];

// WHERE A SPECIFIER CAN APPEAR, and it took two goes to get this right, so
// both corrections are written down rather than quietly folded in.
//
// Anchored on the word `require` it missed
// `createRequire(import.meta.url)('posthog-node')`, because the thing before
// the string is a bracket, not a word. That is the last alternative below.
//
// Anchored with the closing quote straight after the package name it missed
// `@modelcontextprotocol/sdk/server/mcp.js`, because that is a subpath. So the
// whole specifier is captured and `packageOf` reduces it afterwards.
//
// Widening it to every quoted string in the file was the overcorrection: that
// reads `read_chat` out of a tool definition and calls it a package.
const WANTS = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*|\bcreateRequire\([^)]*\)\s*\(\s*)['"]([^'"\n]+)['"]/g;

/** What npm allows a package to be called. Keeps `, ` out of the answer. */
const LOOKS_LIKE_A_PACKAGE = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;

/** `@scope/name/deep/path` is the package `@scope/name`. `a/b` is `a`. */
function packageOf(spec) {
  return spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
}

/**
 * COMMENTS COME OUT FIRST, and this file is heavily commented so that matters.
 * `* from "opus" to a Codex slug` in main/supervisor.mjs is prose about a model
 * alias, and it read as a package called opus.
 *
 * Only whole comment lines are dropped, never a `//` found mid-line: that would
 * cut the tail off a url sitting inside a string, and a half-eaten line is a
 * worse input than a commented one.
 */
function code(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n');
}

const wanted = new Map();
for (const file of files) {
  const source = code(fs.readFileSync(path.join(here, file), 'utf8'));
  for (const m of source.matchAll(WANTS)) {
    const spec = m[1];
    if (spec.startsWith('node:') || spec.startsWith('.') || spec.startsWith('/')) continue;
    const name = packageOf(spec);
    if (!LOOKS_LIKE_A_PACKAGE.test(name)) continue;
    if (!wanted.has(name)) wanted.set(name, file);
  }
}

// Electron is the one package the runtime names and must NOT depend on. The
// desktop app is started BY Electron, which supplies it; the browser door never
// loads main/main.mjs at all. Making it a dependency would put 297 MB into
// every `npx` run to satisfy a file that run never opens.
const SUPPLIED_BY_THE_HOST = new Set(['electron']);

describe('the dependency list', () => {
  const declared = new Set(Object.keys(pkg.dependencies));

  it('has every package the code that runs asks for', () => {
    const missing = [...wanted]
      .filter(([name]) => !declared.has(name) && !SUPPLIED_BY_THE_HOST.has(name))
      // Anything resolvable inside the repo is ours, not a package.
      .filter(([name]) => !name.startsWith('.'));
    expect(missing.map(([name, file]) => `${name} (wanted by ${file})`)).toEqual([]);
  });

  it('has nothing in it that only the build uses', () => {
    const unused = [...declared].filter((name) => !wanted.has(name));
    expect(unused).toEqual([]);
  });

  it('is short, because a long one here is the bug this file is about', () => {
    // Five today. The number is a ceiling rather than an equality so that
    // adding a real one is not a test edit, but doubling it is.
    expect(Object.keys(pkg.dependencies).length).toBeLessThan(10);
  });

  it('keeps the packages the screen is built from, so this repo can still build', () => {
    // They did not leave; they moved. A fresh clone runs `npm install` and gets
    // them, because devDependencies install by default.
    for (const name of ['react', 'react-dom', 'vite', '@tiptap/core', 'pdfjs-dist', '@xterm/xterm']) {
      expect(Object.keys(pkg.devDependencies)).toContain(name);
    }
  });

  it('says which node it was tested on rather than guessing lower', () => {
    expect(pkg.engines?.node).toBe('>=22');
  });
});

// THE TERMINAL, AFTER AN INSTALL RATHER THAN IN THIS CHECKOUT.
//
// Found by packing the tarball and installing it into an empty folder on
// 2026-09-25. node-pty loaded fine and the first spawn died with
// `posix_spawnp failed`, because both prebuilt `spawn-helper` binaries arrived
// 644 instead of 755: an npm tarball does not reliably carry the executable
// bit. In this repo they are 755, so nothing here could ever have shown it.
//
// scripts/after-install.mjs is the fix and it runs as `postinstall`. The test
// below is the part that matters: it builds a folder shaped like a real install
// with a non-executable helper in it, runs the real script, and checks the bit.
describe('the terminal survives being installed', () => {
  it('is declared as a postinstall and is inside the package', () => {
    expect(pkg.scripts.postinstall).toBe('node scripts/after-install.mjs');
    // A postinstall naming a file the tarball does not carry is worse than none.
    expect(pkg.files).toContain('scripts/after-install.mjs');
    expect(fs.existsSync(path.join(here, 'scripts', 'after-install.mjs'))).toBe(true);
  });

  it('makes a helper that arrived unexecutable executable', () => {
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-post-'));
    try {
      const pty = path.join(sandbox, 'node_modules', 'node-pty');
      const prebuilds = path.join(pty, 'prebuilds', 'darwin-arm64');
      fs.mkdirSync(prebuilds, { recursive: true });
      fs.writeFileSync(path.join(pty, 'package.json'), JSON.stringify({ name: 'node-pty', version: '0.0.0', main: 'index.js' }));
      fs.writeFileSync(path.join(pty, 'index.js'), 'module.exports = {};');
      const helper = path.join(prebuilds, 'spawn-helper');
      fs.writeFileSync(helper, '#!/bin/sh\nexit 0\n');
      fs.chmodSync(helper, 0o644);

      fs.mkdirSync(path.join(sandbox, 'scripts'));
      const script = path.join(sandbox, 'scripts', 'after-install.mjs');
      fs.copyFileSync(path.join(here, 'scripts', 'after-install.mjs'), script);

      expect(fs.statSync(helper).mode & 0o111).toBe(0);
      execFileSync(process.execPath, [script], { cwd: sandbox, stdio: 'ignore' });
      expect(fs.statSync(helper).mode & 0o111).not.toBe(0);
    } finally {
      fs.rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it('does not fail an install when there is no node-pty to fix', () => {
    // A platform with no prebuilds, or a folder it cannot write to, are both
    // ordinary. Neither is a reason to make npm install exit non-zero.
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-post-bare-'));
    try {
      fs.mkdirSync(path.join(sandbox, 'scripts'));
      const script = path.join(sandbox, 'scripts', 'after-install.mjs');
      fs.copyFileSync(path.join(here, 'scripts', 'after-install.mjs'), script);
      execFileSync(process.execPath, [script], { cwd: sandbox, stdio: 'ignore' });
    } finally {
      fs.rmSync(sandbox, { recursive: true, force: true });
    }
  });
});
