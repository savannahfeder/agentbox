// APPROVALS DIED WHEN THE APP RAN FROM SOURCE ON A MAC WITHOUT NVM.
//
// Reported on 2026-10-07 (GitHub issue 21) and confirmed in this tree. The
// source branch of scripts/approval-server.sh prepended
// `$HOME/.nvm/versions/node/<newest>/bin` to PATH and then `exec node`. On a
// Mac that installed node by Homebrew, Volta, asdf or not at all that folder
// does not exist, PATH is unchanged, and an MCP server booting from a bare
// login shell has no node on it, so the exec failed. From there it is the
// failure this file's sibling test already records: the Claude CLI refuses to
// start a session at all when the tool named by --permission-prompt-tool is
// missing, so every agent dies in about four seconds.
//
// The fix is the one the packaged branch already uses: the app's own binary is
// Electron, and Electron runs a script with ELECTRON_RUN_AS_NODE=1, needing no
// node on the machine. The supervisor hands its own process.execPath down in
// ZERO_APPROVALS_RUNTIME and the source branch runs that. The nvm sweep stays
// only as a fallback for somebody running the script by hand.

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { Supervisor } from '../main/supervisor.mjs';
import { NAME } from '../shared/product-name.mjs';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const launcher = path.join(repo, 'scripts', 'approval-server.sh');
const server = path.join(repo, 'main', 'approval-prompt-server.mjs');

const temps = [];
function tmpdir(tag) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `approvals-${tag}-`));
  temps.push(d);
  return d;
}
afterEach(() => {
  while (temps.length) fs.rmSync(temps.pop(), { recursive: true, force: true });
});

/** A stand-in for a runtime: it prints who it is and what it was asked to run. */
function stub(file, who) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `#!/bin/bash\necho "${who} $ELECTRON_RUN_AS_NODE $1"\n`);
  fs.chmodSync(file, 0o755);
  return file;
}

/** The launcher, run with nothing of this Mac's environment but a bare PATH. */
function run(env, script = launcher) {
  return execFileSync('bash', [script], {
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin', ...env },
  }).trim();
}

describe('the approvals launcher, run from source', () => {
  it('runs the binary the app handed it, when the Mac has no node at all', () => {
    const dir = tmpdir('handed');
    const home = path.join(dir, 'home');
    fs.mkdirSync(home);
    const runtime = stub(path.join(dir, 'Electron'), 'app-binary');
    // ELECTRON_RUN_AS_NODE=1 is what makes that binary a node, so it is part
    // of the claim: without it Electron opens a window instead.
    expect(run({ HOME: home, ZERO_APPROVALS_RUNTIME: runtime })).toBe(`app-binary 1 ${server}`);
  });

  it('still finds nvm’s newest node when nobody handed it a binary', () => {
    const dir = tmpdir('nvm');
    const home = path.join(dir, 'home');
    const versions = path.join(home, '.nvm', 'versions', 'node');
    stub(path.join(versions, 'v18.20.4', 'bin', 'node'), 'old-nvm-node');
    stub(path.join(versions, 'v22.9.0', 'bin', 'node'), 'new-nvm-node');
    expect(run({ HOME: home })).toBe(`new-nvm-node  ${server}`);
  });

  it('falls back to nvm when the binary it was handed is not there', () => {
    const dir = tmpdir('stale');
    const home = path.join(dir, 'home');
    stub(path.join(home, '.nvm', 'versions', 'node', 'v22.9.0', 'bin', 'node'), 'nvm-node');
    const gone = path.join(dir, 'Electron.app', 'Contents', 'MacOS', 'Electron');
    expect(run({ HOME: home, ZERO_APPROVALS_RUNTIME: gone })).toBe(`nvm-node  ${server}`);
  });

  it('uses the node already on PATH, so a Homebrew Mac needs no nvm', () => {
    const dir = tmpdir('brew');
    const home = path.join(dir, 'home');
    fs.mkdirSync(home);
    const bin = path.join(dir, 'bin');
    stub(path.join(bin, 'node'), 'path-node');
    expect(run({ HOME: home, PATH: `${bin}:/usr/bin:/bin` })).toBe(`path-node  ${server}`);
  });
});

describe('the packaged launcher is not touched by any of this', () => {
  it('runs the bundle’s own binary even when another is handed to it', () => {
    const dir = tmpdir('bundle');
    const name = NAME;
    const contents = path.join(dir, `${name}.app`, 'Contents');
    const scripts = path.join(contents, 'Resources', 'app.asar.unpacked', 'scripts');
    fs.mkdirSync(scripts, { recursive: true });
    fs.writeFileSync(path.join(contents, 'Info.plist'),
      `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict><key>CFBundleExecutable</key><string>${name}</string></dict></plist>\n`);
    fs.copyFileSync(launcher, path.join(scripts, 'approval-server.sh'));
    stub(path.join(contents, 'MacOS', name), 'bundle-binary');
    const other = stub(path.join(dir, 'Somebody-elses-Electron'), 'wrong-binary');
    const out = run({ HOME: path.join(dir, 'home'), ZERO_APPROVALS_RUNTIME: other },
      path.join(scripts, 'approval-server.sh'));
    expect(out).toBe(`bundle-binary 1 ${path.join(contents, 'Resources', 'app.asar', 'main', 'approval-prompt-server.mjs')}`);
  });
});

describe('the supervisor', () => {
  it('hands the approvals server the binary this app is running on', () => {
    const dir = tmpdir('supervisor');
    const sup = new Supervisor({ storeRoot: dir }, { listItems: () => [], listProducts: () => [] }, repo);
    try {
      const approvals = sup.mcpServers()['zero-approvals'];
      expect(approvals.command).toBe(launcher);
      expect(approvals.env.ZERO_APPROVALS_RUNTIME).toBe(process.execPath);
    } finally {
      sup.stop?.();
    }
  });
});
