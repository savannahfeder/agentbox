// THE CODEX HOME IS MADE BEFORE ANYTHING IS POINTED AT IT.
//
// Found by the tester, 2026-10-23 (F-03), and measured on codex-cli 0.164.0:
//
//   $ CODEX_HOME=/tmp/throwaway/missing codex app-server
//   Error: CODEX_HOME points to "/tmp/throwaway/missing", but that path does
//   not exist
//   $ echo $?
//   1
//
// An empty folder that EXISTS exits 0. So the one thing between a brand new
// computer and a working Codex is a `mkdir`, and the app has always passed
// `CODEX_HOME` explicitly -- `~/.codex` by default -- which on a computer that
// has never run Codex is a path that does not exist. Every Codex thread on such
// a machine met an app-server that died on its first line.
//
// `makeCodexHome` next door has known this since the Add-account card handed
// out a broken command ("codex-cli refuses a CODEX_HOME that does not exist
// yet"). It only ever made the folder for a SECOND login. This is the same
// knowledge applied to the first one.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureCodexHome } from '../main/codex-account.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'codex-home-'));

describe('making the home', () => {
  it('makes a home that is not there, which is what codex-cli refuses', () => {
    const home = path.join(tmp(), '.codex');
    expect(fs.existsSync(home)).toBe(false);
    expect(ensureCodexHome(home)).toBe(home);
    expect(fs.statSync(home).isDirectory()).toBe(true);
  });

  // THE BOUNDARY EITHER SIDE. A home that is already there is left exactly as
  // it is: it holds somebody's login and their config.
  it('leaves a home that is already there alone, with everything in it', () => {
    const home = path.join(tmp(), '.codex');
    fs.mkdirSync(home, { recursive: true });
    fs.writeFileSync(path.join(home, 'auth.json'), '{"ok":1}');
    expect(ensureCodexHome(home)).toBe(home);
    expect(fs.readFileSync(path.join(home, 'auth.json'), 'utf8')).toBe('{"ok":1}');
  });

  it('makes the folders above it too, since a configured home can be anywhere', () => {
    const home = path.join(tmp(), 'work', 'homes', 'codex');
    expect(ensureCodexHome(home)).toBe(home);
    expect(fs.statSync(home).isDirectory()).toBe(true);
  });

  // THE CASES THAT MUST NOT MATCH. Nothing to make is not an error, and a
  // `mkdir` that cannot run is not a reason to stop a spawn: codex-cli's own
  // message about the folder is better than a crash on the way to it.
  it('says nothing and makes nothing when there is no home to make', () => {
    expect(ensureCodexHome(null)).toBe(null);
    expect(ensureCodexHome('')).toBe('');
  });

  it('hands the path back even when it could not make the folder', () => {
    const file = path.join(tmp(), 'not-a-folder');
    fs.writeFileSync(file, 'x');
    const home = path.join(file, '.codex');
    expect(ensureCodexHome(home)).toBe(home);
  });
});

describe('where it is called', () => {
  // Every local spawn that names a CODEX_HOME. The cloud one names a path
  // inside its own sandbox, which this process cannot make.
  it('runs before the app-server every Codex thread talks to', () => {
    const sup = read('main/supervisor.mjs');
    const fn = sup.slice(sup.indexOf('  _codexServer('), sup.indexOf('  _codexServer(') + 2000);
    expect(fn).toMatch(/ensureCodexHome/);
  });

  it('runs before the app-server the model list is read from', () => {
    expect(read('main/refresh-agent-models.mjs')).toMatch(/ensureCodexHome/);
  });
});
