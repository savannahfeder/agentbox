// WHAT `npm publish` WOULD ACTUALLY PUT ON THE INTERNET.
//
// Agentbox is going out as an open source package people install with npx, and
// npm's default is to ship the entire working tree. Before the `files` field
// landed that was 1,028 files and 204.8 MB: the tests, the designs, the
// screenshots, and every scratch file anybody had left lying about.
//
// The one that matters is briefs/founder.md, the standing instructions. It is
// not in git, which is why nobody would notice: a `.gitignore` entry does not
// stop `npm publish`, because a `files` list overrides it. So the negation in
// package.json is the only thing keeping it out of the tarball, and a negation
// is one careless edit from being dropped.
//
// This asks npm itself what it would send rather than reading package.json and
// believing it, because the failure being guarded is exactly a list that reads
// correctly and does not behave the way it reads.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, '..');
const founderBrief = path.join(repoRoot, 'briefs', 'founder.md');

let manifest;
let plantedIt = false;
const planted = [];

/**
 * Leave a file where a stray one really turns up, and remember to take it away.
 *
 *  A `files` list is only ever tested against a tidy checkout, which is the one
 *  state it is never used in. Both of these are real: on 2026-09-25 this repo
 *  had a 188 KB Mach-O binary sitting in main/ and a script reading the
 *  founder's own inbox sitting in scripts/lib/, both left by other sessions,
 *  and `main/` and `scripts/lib/` were both whole directories in `files`.
 */
function plant(rel, body) {
  const at = path.join(repoRoot, rel);
  if (fs.existsSync(at)) return;
  fs.mkdirSync(path.dirname(at), { recursive: true });
  fs.writeFileSync(at, body);
  planted.push(at);
}

beforeAll(() => {
  plant('main/a-stray-binary', '\x7fELF not really, but not source either\n');
  plant('scripts/lib/somebody-scratch-file.mjs', '// left behind by a design run\n');
  // The file is normally absent from a fresh checkout, and a test that only
  // passes because the file is missing is not a test. So put one there.
  if (!fs.existsSync(founderBrief)) {
    fs.writeFileSync(founderBrief, 'planted by a test, not real instructions\n');
    plantedIt = true;
  }
  // --ignore-scripts because `prepack` builds the renderer, which takes a
  // minute and tells us nothing here. The output has npm's own chatter above
  // it, so the json is read from the first bracket on.
  const raw = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 32 * 1024 * 1024,
  });
  manifest = JSON.parse(raw.slice(raw.indexOf('[')))[0];
}, 120_000);

afterAll(() => {
  if (plantedIt) fs.rmSync(founderBrief, { force: true });
  for (const at of planted) fs.rmSync(at, { force: true });
});

describe('the tarball npm would publish', () => {
  const has = (predicate) => manifest.files.some((f) => predicate(f.path));

  it('does not carry the founder brief, even when the file is sitting there', () => {
    expect(fs.existsSync(founderBrief)).toBe(true);
    expect(has((p) => p.includes('founder.md'))).toBe(false);
  });

  it('does not carry the tests, the designs or anybody scratch work', () => {
    for (const dir of ['tests/', 'designs/', 'docs/', 'scripts/scratch/', 'shots/', 'release/']) {
      expect(has((p) => p.startsWith(dir))).toBe(false);
    }
  });

  it('carries source out of main, and not whatever else is lying in it', () => {
    expect(fs.existsSync(path.join(repoRoot, 'main', 'a-stray-binary'))).toBe(true);
    expect(has((p) => p === 'main/a-stray-binary')).toBe(false);
    // Every main/ file that does ship is source.
    for (const f of manifest.files.filter((f) => f.path.startsWith('main/'))) {
      expect(f.path).toMatch(/\.mjs$/);
    }
  });

  it('carries the two scripts the app runs, and not the harness beside them', () => {
    // scripts/lib/ is where the screenshot and design harnesses live, nothing
    // at run time imports any of it, and it is where scratch files land.
    expect(fs.existsSync(path.join(repoRoot, 'scripts', 'lib', 'somebody-scratch-file.mjs'))).toBe(true);
    expect(has((p) => p.startsWith('scripts/lib/'))).toBe(false);
    const shipped = manifest.files.filter((f) => f.path.startsWith('scripts/')).map((f) => f.path).sort();
    expect(shipped).toEqual([
      'scripts/after-install.mjs',
      'scripts/approval-server.sh',
      'scripts/before-publish.mjs',
    ]);
  });

  it('carries the command, the doing half and the licence', () => {
    expect(has((p) => p === 'bin/agentbox.mjs')).toBe(true);
    expect(has((p) => p === 'main/serve.mjs')).toBe(true);
    expect(has((p) => p === 'main/ipc.mjs')).toBe(true);
    expect(has((p) => p === 'LICENSE')).toBe(true);
    expect(has((p) => p === 'worker-permissions.json')).toBe(true);
  });

  it('stays small enough that npx is not a download', () => {
    // 2.1 MB without the built screen, and the screen is the only thing that
    // will move this much. Well under the 204.8 MB it was, and the ceiling is
    // set where a regression means somebody shipped a folder, not a file.
    expect(manifest.unpackedSize).toBeLessThan(80 * 1024 * 1024);
    expect(manifest.entryCount).toBeLessThan(600);
  });
});

describe('the command npx would run', () => {
  it('is named in bin and is on disk', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    expect(pkg.bin).toEqual({ agentbox: 'bin/agentbox.mjs' });
    expect(fs.existsSync(path.join(repoRoot, pkg.bin.agentbox))).toBe(true);
  });

  it('starts with a shebang, or npx hands it to the shell', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'bin', 'agentbox.mjs'), 'utf8');
    expect(source.startsWith('#!/usr/bin/env node')).toBe(true);
  });
});
