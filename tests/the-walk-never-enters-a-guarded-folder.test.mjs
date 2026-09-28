// THE WALK NEVER ENTERS A FOLDER macOS GUARDS.
//
// That was macOS, and the thing pointing it at her Mac was ours. The setup's
// folder picker opens on the home folder, so pressing Open without navigating
// made the home folder the project, and main/store.mjs then calls answerFor ->
// countFolder on it to write one sentence about the project. countFolder walks
// three levels, so it read ~/Desktop, ~/Documents, ~/Downloads, ~/Movies,
// ~/Music, ~/Pictures and ~/Library, and the system answered every one of them
// with a consent panel carrying our name.
//
// The picker refusing the home folder is the first door and it is in
// shared/project-folder-check.mjs. This is the second: whatever folder the walk
// is handed, and by whatever caller, it does not open a guarded one.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { countFolder } from '../main/first-run.mjs';

const GUARDED = ['Desktop', 'Documents', 'Downloads', 'Movies', 'Music', 'Pictures', 'Library', 'Public'];

let home;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'guarded-walk-'));
});
afterEach(() => {
  try { fs.rmSync(home, { recursive: true, force: true }); } catch { /* gone already */ }
});

/**
 * A home folder shaped like a real one: every guarded folder with a file
 *  inside it, plus one ordinary project folder that is not guarded. */
function makeHome() {
  for (const g of GUARDED) {
    fs.mkdirSync(path.join(home, g, 'inner'), { recursive: true });
    fs.writeFileSync(path.join(home, g, 'inner', 'secret.txt'), 'private');
    fs.writeFileSync(path.join(home, g, 'top.txt'), 'private');
  }
  fs.mkdirSync(path.join(home, 'dev', 'app', 'src'), { recursive: true });
  fs.writeFileSync(path.join(home, 'dev', 'app', 'src', 'index.ts'), 'export {}');
}

/** Every directory the walk actually listed. */
function listedBy(fn) {
  const seen = [];
  const real = fs.readdirSync;
  fs.readdirSync = function (p, o) { seen.push(String(p)); return real.call(fs, p, o); };
  try { fn(); } finally { fs.readdirSync = real; }
  return seen;
}

describe('the walk never enters a folder macOS guards', () => {
  it('lists none of the guarded folders when handed the home folder', () => {
    makeHome();
    const seen = listedBy(() => countFolder(home, { home }));
    for (const g of GUARDED) {
      const dir = path.join(home, g);
      expect(seen.filter((s) => s === dir || s.startsWith(dir + path.sep))).toEqual([]);
    }
  });

  it('counts a guarded folder as a folder, so the number stays honest', () => {
    makeHome();
    const out = countFolder(home, { home });
    // The eight guarded folders are counted, and nothing inside them is.
    expect(out.dirs).toBeGreaterThanOrEqual(GUARDED.length);
    expect(out.files).toBe(1); // only dev/app/src/index.ts
    expect(out.ext['.txt']).toBeUndefined();
  });

  it('still counts a project that lives INSIDE a guarded folder', () => {
    makeHome();
    const inside = path.join(home, 'Documents', 'my-app');
    fs.mkdirSync(path.join(inside, 'src'), { recursive: true });
    fs.writeFileSync(path.join(inside, 'src', 'main.rs'), 'fn main() {}');
    // The walk starts BELOW the guard, so the guard never applies.
    const out = countFolder(inside, { home });
    expect(out.files).toBe(1);
    expect(out.ext['.rs']).toBe(1);
  });

  it('matches whole paths, not names, so a project called Documents is fine', () => {
    fs.mkdirSync(path.join(home, 'dev', 'Documents', 'src'), { recursive: true });
    fs.writeFileSync(path.join(home, 'dev', 'Documents', 'src', 'a.py'), 'x = 1');
    const out = countFolder(path.join(home, 'dev'), { home });
    expect(out.ext['.py']).toBe(1);
  });

  it('guards against the real home folder by default, with no home passed', () => {
    // The default argument is os.homedir, which is the case that shipped.
    const seen = listedBy(() => countFolder(os.homedir()));
    const real = os.homedir();
    for (const g of GUARDED) {
      const dir = path.join(real, g);
      expect(seen.filter((s) => s === dir || s.startsWith(dir + path.sep))).toEqual([]);
    }
  });
});
