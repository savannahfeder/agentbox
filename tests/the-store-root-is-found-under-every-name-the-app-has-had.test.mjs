// THE STORE ROOT IS FOUND UNDER EVERY NAME THIS APP HAS HAD, AND THE FUNCTION
// THAT FINDS IT ACTUALLY RUNS.
//
// The rename of 2026-09-22 turned `process.env.ASTRAL_HOME` into `readEnv('HOME')`
// in main/store/project.mjs and did not import `readEnv`. Nothing in 7,335 tests
// called `legacyRoot()`, so the whole suite was green, the change was merged and
// pushed, and the store MCP server died on startup with one line:
//
//   [agentbox-store] failed to start: readEnv is not defined
//
// A worker that cannot reach the store cannot claim a row, write a checkpoint or
// finish one. That is the 2026-08-05 failure ("five sessions of analysis written
// to nowhere") arriving through a typo, and the only reason it was caught was a
// by-hand run of the server after the push.
//
// So these call the functions rather than reading the source of them. A missing
// import is a ReferenceError at CALL time, which is exactly what a test that
// only imports the module will never see.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { legacyRoot } from '../main/store/project.mjs';
import { appHome, storeRootEnv } from '../main/store/home.mjs';
import { WAS, ENV_PREFIX, envName, envNames, nameSlug, readEnv } from '../shared/product-name.mjs';

const held = {};
beforeEach(() => {
  for (const key of envNames('HOME')) { held[key] = process.env[key]; delete process.env[key]; }
});
afterEach(() => {
  for (const [key, value] of Object.entries(held)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

describe('the variable the store root is handed to us in', () => {
  it('is named after the app, and every older name still answers', () => {
    expect(envName('HOME')).toBe(`${ENV_PREFIX}_HOME`);
    expect(envNames('HOME')[0]).toBe(envName('HOME'));
    for (const was of WAS) expect(envNames('HOME')).toContain(`${was.toUpperCase()}_HOME`);
  });

  it('reads the current name first and falls back through the old ones', () => {
    process.env[envNames('HOME')[1]] = '/older';
    expect(readEnv('HOME')).toBe('/older');
    process.env[envName('HOME')] = '/current';
    expect(readEnv('HOME')).toBe('/current');
  });

  // An exported-but-empty variable is how a shell says nothing. Treating it as
  // an answer points the whole store at the empty string.
  it('treats an empty one as unset', () => {
    process.env[envName('HOME')] = '   ';
    expect(readEnv('HOME')).toBeUndefined();
  });

  it('is written back out under every name, for readers outside this repo', () => {
    const env = storeRootEnv('/Zero');
    expect(Object.keys(env)).toEqual(envNames('HOME'));
    for (const value of Object.values(env)) expect(value).toBe('/Zero');
  });
});

describe('the two functions that read it', () => {
  // THE ONE THAT BROKE. Called, not read: a missing import only shows here.
  it('legacyRoot answers under the current name and under an old one', () => {
    process.env[envName('HOME')] = '/Zero/current';
    expect(legacyRoot()).toBe('/Zero/current');
    delete process.env[envName('HOME')];
    process.env[envNames('HOME')[2]] = '/Zero/older';
    expect(legacyRoot()).toBe('/Zero/older');
  });

  it('legacyRoot falls back to a folder in her home when nothing is set', () => {
    expect(legacyRoot().startsWith(os.homedir())).toBe(true);
  });

  it('appHome answers the app-named dot-folder when nothing is set', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'store-root-'));
    try {
      expect(appHome(tmp)).toBe(path.join(tmp, `.${nameSlug}`));
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  });
});
