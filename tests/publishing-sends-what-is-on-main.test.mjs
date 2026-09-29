// THE ONE ACTION IN THIS REPO THAT CANNOT BE UNDONE.
//
// npm never lets a published version be replaced, only superseded. So sending
// the wrong commit is not a mistake you fix, it is a version number you burn
// and a correction you have to explain.
//
// AND THE WRONG COMMIT IS EASY TO SEND, which is the whole reason for this.
// There are two checkouts of this repo on the machine it is built on: the one
// work happens in, and ~/Astral, where the running app lives, sitting on
// whatever branch it was last built from. Both have a package.json saying
// agentbox-app. `npm login` is global, so signing in from one folder makes
// `npm publish` work in the other. On 2026-09-25 the terminal was in ~/Astral,
// behind main, carrying a description that had already been replaced. The
// command would have worked and nothing about it would have looked wrong.
//
// scripts/before-publish.mjs runs as prepublishOnly and refuses unless the
// commit being sent is the tip of origin/main with nothing uncommitted on top.
// These tests build real git repositories in the states that matter and run it.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const GUARD = path.join(here, 'scripts', 'before-publish.mjs');

let root;

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** Run the guard somewhere, and report what it decided. */
function runGuard(cwd, env = {}) {
  try {
    const out = execFileSync(process.execPath, [GUARD], {
      cwd, encoding: 'utf8', env: { ...process.env, ...env },
    });
    return { allowed: true, said: out };
  } catch (err) {
    return { allowed: false, said: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

/** A checkout with a real `origin/main` behind it, sitting exactly on the tip. */
function makeRepo() {
  const at = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-pub-'));
  const origin = path.join(at, 'origin.git');
  const work = path.join(at, 'work');
  execFileSync('git', ['init', '--bare', '--initial-branch=main', origin], { stdio: 'ignore' });
  execFileSync('git', ['clone', origin, work], { stdio: 'ignore' });
  git(work, 'config', 'user.email', 'test@example.invalid');
  git(work, 'config', 'user.name', 'A Test');
  // A real package with a real `files` list, because the guard asks npm what
  // it would pack and the whole point is which uncommitted files that reaches.
  fs.mkdirSync(path.join(work, 'ships'));
  fs.writeFileSync(path.join(work, 'ships', 'a.mjs'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(work, 'package.json'), JSON.stringify({
    name: 'a-test-package', version: '1.0.0', files: ['ships/**/*.mjs'],
  }, null, 2) + '\n');
  git(work, 'add', '-A');
  git(work, 'commit', '-m', 'first');
  git(work, 'push', 'origin', 'main');
  return { at, work };
}

beforeAll(() => { root = makeRepo(); });
afterAll(() => { if (root) fs.rmSync(root.at, { recursive: true, force: true }); });

describe('the guard on npm publish', () => {
  it('lets through a clean checkout sitting on the tip of origin/main', () => {
    const r = runGuard(root.work);
    expect(r.allowed, r.said).toBe(true);
    expect(r.said).toContain('tip of origin/main');
  });

  it('refuses an uncommitted file that would go into the package, and names it', () => {
    fs.writeFileSync(path.join(root.work, 'ships', 'stray.mjs'), 'export const stray = 1;\n');
    const r = runGuard(root.work);
    fs.rmSync(path.join(root.work, 'ships', 'stray.mjs'));
    expect(r.allowed).toBe(false);
    expect(r.said).toContain('ships/stray.mjs');
  });

  it('ignores what the publish itself rewrites, or every attempt poisons the next', () => {
    // `prepack` runs the build, the build reads the installed Claude Code and
    // writes shared/*.generated.*, so a failed publish leaves those modified
    // and the retry refuses because of dirt the last try made. Measured
    // 2026-09-28: one failed attempt blocked the next one on a version number.
    fs.writeFileSync(path.join(root.work, 'ships', 'a-table.generated.mjs'), 'export const READ_AT = "today";\n');
    const r = runGuard(root.work);
    fs.rmSync(path.join(root.work, 'ships', 'a-table.generated.mjs'));
    expect(r.allowed, r.said).toBe(true);
  });

  it('ignores uncommitted files the package does not reach', () => {
    // THE REASON THIS MATTERS. Several agents share the checkout this runs in,
    // so there is always somebody's scratch file in it: on 2026-09-25 there
    // were 42. Refusing over files that cannot ship teaches you to reach for
    // the override, and an override you always use is not a guard.
    fs.mkdirSync(path.join(root.work, 'scratch'), { recursive: true });
    fs.writeFileSync(path.join(root.work, 'scratch', 'a-design-run.mjs'), '// mine\n');
    fs.writeFileSync(path.join(root.work, 'notes.txt'), 'thinking\n');
    const r = runGuard(root.work);
    fs.rmSync(path.join(root.work, 'scratch'), { recursive: true, force: true });
    fs.rmSync(path.join(root.work, 'notes.txt'));
    expect(r.allowed, r.said).toBe(true);
  });

  it('sees inside a whole new directory, not just its name', () => {
    // `git status --porcelain` reports an untracked directory as one line, so
    // a file inside it never gets compared to anything. --untracked-files=all
    // is what makes this case visible.
    fs.mkdirSync(path.join(root.work, 'ships', 'deeper'), { recursive: true });
    fs.writeFileSync(path.join(root.work, 'ships', 'deeper', 'b.mjs'), 'export const b = 2;\n');
    const r = runGuard(root.work);
    fs.rmSync(path.join(root.work, 'ships', 'deeper'), { recursive: true, force: true });
    expect(r.allowed).toBe(false);
    expect(r.said).toContain('ships/deeper/b.mjs');
  });

  it('refuses a commit that is not on origin/main, and names the branch', () => {
    git(root.work, 'checkout', '-q', '-b', 'somewhere-else');
    fs.writeFileSync(path.join(root.work, 'ships', 'c.mjs'), 'export const c = 3;\n');
    git(root.work, 'add', '-A');
    git(root.work, 'commit', '-m', 'not pushed');
    const r = runGuard(root.work);
    git(root.work, 'checkout', '-q', 'main');
    expect(r.allowed).toBe(false);
    expect(r.said).toContain('somewhere-else');
    expect(r.said).toContain('not on origin/main');
  });

  it('refuses a checkout that is behind, which is the ~/Astral case', () => {
    // Exactly the shape of the real hazard: on main, clean, nothing wrong with
    // it, simply older than what was reviewed.
    const stale = path.join(root.at, 'stale');
    execFileSync('git', ['clone', path.join(root.at, 'origin.git'), stale], { stdio: 'ignore' });
    git(stale, 'config', 'user.email', 'test@example.invalid');
    git(stale, 'config', 'user.name', 'A Test');

    fs.writeFileSync(path.join(root.work, 'ships', 'd.mjs'), 'export const d = 4;\n');
    git(root.work, 'add', '-A');
    git(root.work, 'commit', '-m', 'second');
    git(root.work, 'push', 'origin', 'main');

    const r = runGuard(stale);
    expect(r.allowed).toBe(false);
    expect(r.said).toMatch(/1 commit behind origin\/main/);
  });

  it('can be overridden on purpose, because a rule with no door is a rule people work around', () => {
    git(root.work, 'checkout', '-q', '-b', 'still-not-main');
    fs.writeFileSync(path.join(root.work, 'ships', 'e.mjs'), 'export const e = 5;\n');
    git(root.work, 'add', '-A');
    git(root.work, 'commit', '-m', 'local only');
    const r = runGuard(root.work, { AGENTBOX_PUBLISH_ANYWAY: '1' });
    git(root.work, 'checkout', '-q', 'main');
    expect(r.allowed).toBe(true);
  });
});

describe('package.json', () => {
  it('runs the guard before every publish', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(here, 'package.json'), 'utf8'));
    // prepublishOnly and not prepack: prepack also runs on `npm pack`, and
    // packing a branch to look at it is a normal thing to want to do.
    expect(pkg.scripts.prepublishOnly).toBe('node scripts/before-publish.mjs');
  });
});
