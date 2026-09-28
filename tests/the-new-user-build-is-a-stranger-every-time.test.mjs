// "ASTRAL NEW USER", THE BUILD THAT OPENS AS A STRANGER.
//
// Redownloading resets nothing: the walk's done flag, her settings and her store
// all live outside the bundle. So this bundle hands itself a throwaway home on
// every launch, the way the ⌘K row does for the real app, and these pin the
// three things that make that a real test rather than a broken second Agentbox:
//
//   1. It is packed under a name pack-side accepts, with its own identifier, so
//      macOS keeps a permission history for it that is not the real Agentbox's.
//   2. It keeps a data folder of its OWN in her real home, so the half second
//      it spends there before handing over can never take the real Agentbox's
//      single-instance lock.
//   3. The hand-over happens before any path is read, and only when the copy is
//      not already inside a throwaway home, or it would hand over forever.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NEW_USER_NAME, isNewUserBuild, isSideBuild, dataFolderName } from '../shared/side-build.mjs';
import { FRESH_USER_ENV, HOMES, runningAsAFreshUser } from '../shared/fresh-user-home.mjs';
import { NAME, Name } from '../shared/product-name.mjs';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf8');

describe('the name', () => {
  it('is exactly what she asked for', () => {
    expect(NEW_USER_NAME).toBe(`${NAME} new user`);
  });

  it('is one pack-side will pack, under an identifier of its own', () => {
    expect(isSideBuild(NEW_USER_NAME)).toBe(true);
    // The same derivation pack-side.mjs uses, so the panel says who is asking
    // and the history macOS keeps is this bundle's alone.
    const appId = `ac.agentbox.${NEW_USER_NAME.slice(`${Name} `.length).toLowerCase().replace(/[^a-z0-9]+/g, '')}`;
    expect(appId).toBe('ac.agentbox.newuser');
    expect(read('scripts/pack-side.mjs')).toContain('isNewUserBuild(productName)');
  });

  it(`keeps its own data folder rather than the real ${NAME}’s`, () => {
    expect(isNewUserBuild(NEW_USER_NAME)).toBe(true);
    expect(dataFolderName(NEW_USER_NAME)).toBe(NEW_USER_NAME);
    // Every other side build still shares, which is the rule this is an
    // exception to and not a replacement for.
    expect(dataFolderName(`${NAME} Rest`)).toBe(NAME);
  });
});

describe('the hand-over', () => {
  it('happens before the app reads a path or takes a lock', () => {
    const src = read('main/main.mjs');
    const handOver = src.indexOf('isNewUserBuild(app.getName())');
    expect(handOver).toBeGreaterThan(-1);
    expect(handOver).toBeLessThan(src.indexOf("app.getPath('appData')"));
    expect(handOver).toBeLessThan(src.indexOf('requestSingleInstanceLock'));
    // And after the rename, because the rename is what decides the folder the
    // exception above is about.
    expect(handOver).toBeGreaterThan(src.indexOf('app.setName(dataFolderName'));
  });

  it('opens the stranger through the same door the ⌘K row uses, then leaves', () => {
    const src = read('main/main.mjs');
    const block = src.slice(src.indexOf('isNewUserBuild(app.getName())'), src.indexOf('requestSingleInstanceLock'));
    expect(block).toContain('openFreshUser({ withAgents: true');
    expect(block).toContain('app.exit(0)');
  });

  it('only happens once: a copy already inside a throwaway home is the stranger', () => {
    const src = read('main/main.mjs');
    expect(src).toContain('isNewUserBuild(app.getName()) && !runningAsAFreshUser()');
    // The mark the hand-over sets is the mark the copy reads.
    expect(runningAsAFreshUser({ [FRESH_USER_ENV]: '1' })).toBe(true);
    expect(runningAsAFreshUser({ HOME: path.join(HOMES, '2026-09-01T00-00-00') })).toBe(true);
    expect(runningAsAFreshUser({ HOME: '/Users/somebody' })).toBe(false);
  });
});
