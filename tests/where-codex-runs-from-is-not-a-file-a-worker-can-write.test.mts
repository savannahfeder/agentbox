// WHERE CODEX RUNS FROM IS NOT A FILE A WORKER CAN WRITE.
//
// `main/config.mjs` spreads `zero.config.json` verbatim -- unknown keys are
// kept on purpose, so a setting nobody has taught the app about still survives
// a round trip. That is right for settings and wrong for a PATH THAT GETS
// SPAWNED, and `codexBin` was landing on `config` by exactly that route:
//
// `this.config.codexBin` reaches `spawn` in `_codexServer`, raw.
// `zero.config.json` is gitignored, sits in the app directory, and every worker
// on this machine has a broad Bash allow (worker-permissions.json).
//
// So the one path in the second engine that becomes a process was the one path
// with no finder, no existence check and no `configured` split, while
// `claudeBin` -- the older, better-guarded twin two lines above it -- goes
// through `resolveClaudeBin` and keeps what she SET apart from what we FOUND.
// `main/codex-bin.mjs` is that finder, it has been written and tested since the
// slice before this one, and it was imported by nothing.
//
// THE POINT IS NOT THAT THE CHECK STOPS AN ATTACKER. A worker that can write
// `zero.config.json` can write plenty of other things, and CLAUDE.md's own list
// of what workers may do is broad on purpose. The point is that the two engines
// now fail the same way and are guarded in the same place, and that the fact
// `_engineFor` refuses on -- "is there a Codex on this Mac" -- is answered by
// looking rather than by reading back a string somebody put in a file.
//
// AND CODEX IS OPTIONAL WHERE CLAUDE CODE IS NOT, which is the one asymmetry
// worth keeping. `claudeBin` falls back to the installer's path when nothing is
// found, so anything that spawns it fails with a real path in the message;
// `codexBin` falls back to NULL, because null is what `_engineFor` and
// `_capacityFor` read as "this Mac cannot run the second engine", and a
// made-up path there would advertise an engine that is not installed.

import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../main/config.mjs';

const dirs = [];
afterAll(() => { for (const d of dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } } });

/** An app directory with a zero.config.json in it, and a home with nothing. */
function install(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-config-'));
  dirs.push(dir);
  const home = path.join(dir, 'home');
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(path.join(dir, 'zero.config.json'), JSON.stringify(overrides));
  return { dir, home };
}

describe('the codex path the app would spawn', () => {
  // NOT "is null on this Mac": the candidate list includes absolute system paths
  // like /opt/homebrew/bin/codex, so whether one is found depends on the
  // machine running the suite, and this suite already carries four tests that
  // fail for exactly that reason. What is machine-independent is the SHAPE: the
  // path is either null, or a real file, and never a string nobody checked.
  it('is either null or a path that is really there, never an unchecked string', () => {
    const { dir, home } = install({});
    const config = loadConfig(dir, { home });
    if (config.codexBin === null) expect(config.codexFound).toBe(false);
    else {
      expect(config.codexFound).toBe(true);
      expect(fs.existsSync(config.codexBin)).toBe(true);
    }
  });

  it('keeps what she SET apart from what we FOUND, exactly as claudeBin does', () => {
    const { dir, home } = install({});
    const config = loadConfig(dir, { home });
    expect(config.codexBinConfigured).toBe(null);
    expect('codexFound' in config).toBe(true);
    expect('codexCertain' in config).toBe(true);
  });

  // THE BUG. A path in that file used to become `config.codexBin` untouched and
  // go straight to `spawn`. It is checked now, and a path that is not there is
  // not found -- so `_engineFor` falls back to Claude Code rather than the
  // fleet dying on arrival with ENOENT once per row.
  it('does not believe a configured path that is not on the disk', () => {
    const { dir, home } = install({ codexBin: '/nonexistent/planted/codex' });
    const config = loadConfig(dir, { home });
    expect(config.codexBinConfigured).toBe('/nonexistent/planted/codex');
    expect(config.codexFound).toBe(false);
  });

  // THE CASE THAT MUST NOT MATCH: a configured path that IS there is hers, and
  // her setting still wins over the search, the same way claudeBin's does.
  it('takes a configured path that really exists', () => {
    const { dir, home } = install({});
    const real = path.join(dir, 'codex');
    fs.writeFileSync(real, '#!/bin/sh\n');
    fs.writeFileSync(path.join(dir, 'zero.config.json'), JSON.stringify({ codexBin: real }));
    const config = loadConfig(dir, { home });
    expect(config.codexBin).toBe(real);
    expect(config.codexFound).toBe(true);
    expect(config.codexFrom).toBe('settings');
  });

  // AND THE OTHER TWO KEYS THE SAME FILE CAN CARRY are read where they are used
  // rather than spawned, so they are left alone deliberately -- this test is
  // here so that stays a decision rather than an oversight.
  it('still lets her name a codex home and extra logins', () => {
    const { dir, home } = install({ codexHome: '/somewhere/.codex', codexProfiles: ['default', 'second'] });
    const config = loadConfig(dir, { home });
    expect(config.codexHome).toBe('/somewhere/.codex');
    expect(config.codexProfiles).toEqual(['default', 'second']);
  });
});

describe('the finder that was written and then imported by nothing', () => {
  const source = fs.readFileSync(new URL('../main/codex-bin.mjs', import.meta.url), 'utf8');

  it('is imported by the config that spawns it', () => {
    const config = fs.readFileSync(new URL('../main/config.mjs', import.meta.url), 'utf8');
    expect(config).toMatch(/resolveCodexBin/);
  });

  // This repo treats a comment that has stopped being true as a real defect:
  // the header said "NOTHING HERE SPAWNS ANYTHING AND NOTHING IMPORTS IT YET".
  it('no longer claims to be inert', () => {
    expect(source).not.toMatch(/NOTHING IMPORTS IT YET/i);
    expect(source).not.toMatch(/it is deliberately inert/i);
    // And it names the caller, so the next reader does not have to grep for one.
    expect(source).toMatch(/main\/config\.mjs/);
  });
});
