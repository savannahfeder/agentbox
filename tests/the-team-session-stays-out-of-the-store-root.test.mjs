// THE TEAM SESSION'S REFRESH TOKEN MUST NOT LAND IN THE STORE ROOT.
//
// The team session keeps a long-lived refresh token in plain JSON, and the
// store root is in every Claude worker's additionalDirectories, so a worker
// could read it. On Linux the headless app's dataDir=userDir=storeRoot, so
// headlessSessionFile({userDir: storeRoot, storeRoot}) returned
// storeRoot/team-session.json. Measured here: it returns a path OUTSIDE the
// store root even when the chosen dir IS the store root; a dir already outside
// the store is kept as is; a file left in the store by an older copy is
// migrated out; and when there is no dir outside the store at all, it throws
// rather than write the token where a worker can read it. The desktop app's
// storeRoot/.team-session is left where it is for now, by decision: moving it
// conflicted with main/main.mjs and was taken out of this change.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { headlessSessionFile } from '../main/team/session.mjs';

const inside = (file, root) => {
  const f = path.resolve(file);
  const r = path.resolve(root);
  return f === r || f.startsWith(r + path.sep);
};

let home;
let storeRoot;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'session-home-'));
  storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'session-store-'));
});

afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(storeRoot, { recursive: true, force: true });
});

describe('the headless session when userDir is the store root', () => {
  it('resolves to a path outside the store root, under the config home', () => {
    const file = headlessSessionFile({ userDir: storeRoot, storeRoot, home, env: {} });
    expect(inside(file, storeRoot)).toBe(false);
    expect(inside(file, path.join(home, '.config'))).toBe(true);
  });

  it('honours an absolute XDG_CONFIG_HOME for where it relocates to', () => {
    const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'session-xdg-'));
    try {
      const file = headlessSessionFile({ userDir: storeRoot, storeRoot, home, env: { XDG_CONFIG_HOME: cfg } });
      expect(inside(file, storeRoot)).toBe(false);
      expect(inside(file, cfg)).toBe(true);
    } finally {
      fs.rmSync(cfg, { recursive: true, force: true });
    }
  });

  it('migrates a file an older copy left in the store out to the new place', () => {
    fs.writeFileSync(path.join(storeRoot, 'team-session.json'), '{"token":"t"}', { mode: 0o644 });
    const file = headlessSessionFile({ userDir: storeRoot, storeRoot, home, env: {} });
    expect(inside(file, storeRoot)).toBe(false);
    expect(fs.existsSync(path.join(storeRoot, 'team-session.json'))).toBe(false);
    expect(fs.readFileSync(file, 'utf8')).toBe('{"token":"t"}');
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });
});

describe('the headless session when userDir is already outside the store', () => {
  it('is kept in that dir, and an old store file is moved there', () => {
    const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-userdir-'));
    try {
      fs.writeFileSync(path.join(storeRoot, '.team-session'), '{"token":"t"}', { mode: 0o644 });
      const file = headlessSessionFile({ userDir, storeRoot, home, env: {} });
      expect(path.dirname(file)).toBe(userDir);
      expect(fs.existsSync(path.join(storeRoot, '.team-session'))).toBe(false);
      expect(fs.readFileSync(file, 'utf8')).toBe('{"token":"t"}');
      expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    } finally {
      fs.rmSync(userDir, { recursive: true, force: true });
    }
  });
});

describe('when there is nowhere outside the store to put it', () => {
  it('throws rather than write the token where a worker can read it', () => {
    // A config home that itself sits inside the store leaves no safe path.
    expect(() => headlessSessionFile({
      userDir: storeRoot,
      storeRoot,
      home: storeRoot,
      env: { XDG_CONFIG_HOME: path.join(storeRoot, '.config') },
    })).toThrow();
  });
});
