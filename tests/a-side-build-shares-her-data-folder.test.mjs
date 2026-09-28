// So there is a second bundle, "the app Rest.app", packed by scripts/
// pack-side.mjs. The whole danger of a second bundle is a second DATA FOLDER,
// because the single-instance lock lives in there and that lock is the only
// thing stopping two supervisors spawning twin workers for every answered item.
//
// These pin the rule from both ends: the app puts its name back before it reads
// a path, and the packer refuses a name the app would not recognise.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NEW_USER_NAME, REAL_NAME, isNewUserBuild, isSideBuild, dataFolderName } from '../shared/side-build.mjs';
import { NAME, Name } from '../shared/product-name.mjs';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf8');

describe(`a build packed beside the real ${NAME}`, () => {
  it(`reads and writes the real ${NAME}’s folder, so only one of them can run`, () => {
    expect(dataFolderName(`${NAME} Rest`)).toBe(REAL_NAME);
    expect(dataFolderName(`${NAME} Frame`)).toBe(REAL_NAME);
  });

  it(`leaves the real ${NAME} alone`, () => {
    expect(dataFolderName(Name)).toBe(Name);
    expect(isSideBuild(Name)).toBe(false);
  });

  it('makes one exception, the new-user build, which has nothing of hers to share', () => {
    // It still reads as "the app something" so pack-side accepts it, but it
    // keeps a folder of its own: it lives in a throwaway home and must never
    // take the real Agentbox's lock on its way there.
    expect(isSideBuild(NEW_USER_NAME)).toBe(true);
    expect(isNewUserBuild(NEW_USER_NAME)).toBe(true);
    expect(isNewUserBuild(`${NAME} Rest`)).toBe(false);
    expect(dataFolderName(NEW_USER_NAME)).toBe(NEW_USER_NAME);
  });

  it('does not claim a name that only looks like ours', () => {
    // "Rest" and "AstralRest" are not names anybody would find in the Dock, and
    // silently adopting them would hand a stranger's app her folder.
    expect(isSideBuild('Rest')).toBe(false);
    expect(isSideBuild(`${NAME}Rest`)).toBe(false);
    expect(isSideBuild('')).toBe(false);
    expect(isSideBuild(null)).toBe(false);
  });

  it('puts the name back before the app reads a path from it', () => {
    // Order is the whole of it. app.getPath('userData') is derived from the
    // name, so a rename after the first read is a rename that did nothing.
    const src = read('main/main.mjs');
    const rename = src.indexOf('app.setName(dataFolderName');
    const firstPath = src.indexOf("app.getPath('appData')");
    expect(rename).toBeGreaterThan(-1);
    expect(firstPath).toBeGreaterThan(-1);
    expect(rename).toBeLessThan(firstPath);
  });

  it('is packed under a name the app will recognise, or not packed at all', () => {
    const src = read('scripts/pack-side.mjs');
    expect(src).toContain('isSideBuild(productName)');
    expect(src).toContain('release/side');
    // Never the real name, which is the file a fresh build of main overwrites.
    expect(src).not.toContain(`productName = '${NAME}'`);
  });
});
