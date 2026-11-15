// The suite was 2,507 .mjs files, 314,000 of the repository's 374,000 lines of
// JavaScript, so GitHub drew the repo as mostly JavaScript while the app itself
// was mostly TypeScript (2026-11-06). Every test and helper is now .mts. Vitest
// still runs a .test.mjs so a test written the old way is not skipped, and this
// fails until it is renamed. tests/fixtures keeps its .mjs: those are fake
// command-line tools that tests start as their own node processes.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

function javascriptIn(dir: string, base = root): string[] {
  return fs.readdirSync(path.join(base, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) return rel === path.join('tests', 'fixtures') ? [] : javascriptIn(rel, base);
    return /\.m?js$/.test(e.name) ? [rel] : [];
  });
}

describe('every test is TypeScript', () => {
  it('has no .mjs test or helper outside tests/fixtures', () => {
    expect(javascriptIn('tests'), 'rename these to .mts').toEqual([]);
  });

  it('finds one written the old way', () => {
    const tmp = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR || '/tmp'), 'ts-tests-'));
    fs.mkdirSync(path.join(tmp, 'tests', 'fixtures'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'tests', 'old.test.mjs'), '');
    fs.writeFileSync(path.join(tmp, 'tests', 'new.test.mts'), '');
    fs.writeFileSync(path.join(tmp, 'tests', 'fixtures', 'fake-cli.mjs'), '');
    try {
      expect(javascriptIn('tests', tmp)).toEqual([path.join('tests', 'old.test.mjs')]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
