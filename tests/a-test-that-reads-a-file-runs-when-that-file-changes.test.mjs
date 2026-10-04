// A TEST THAT READS A FILE RUNS WHEN THAT FILE CHANGES.
//
// Measured 2026-10-04: a359d81 (w-f37a34def6) shipped with three tests red on
// main. All three read renderer/src/components/Thread.tsx as TEXT
// (readFileSync), so `vitest related Thread.tsx` -- what both the ship script
// and the push hook run -- ran one test file and not those three. 75 test
// files here read a source file that way. scripts/lib/tests-that-read.mjs
// finds them, and both checks add them to what they run.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { testsThatRead } from '../scripts/lib/tests-that-read.mjs';

function repo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reads-'));
  for (const [f, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
    fs.writeFileSync(path.join(root, f), text);
  }
  return root;
}

describe('the tests that read a changed file', () => {
  const root = repo({
    'tests/joined.test.mjs': "const s = read('renderer', 'src', 'components', 'Thread.tsx');",
    'tests/whole-path.test.mjs': "fs.readFileSync('renderer/src/components/Thread.tsx', 'utf8')",
    'tests/url.test.mjs': "new URL('../renderer/src/components/Thread.tsx', import.meta.url)",
    'tests/other.test.mjs': "read('renderer', 'src', 'components', 'AgentThread.tsx')",
    'tests/word.test.mjs': '// the Thread component is drawn here',
  });

  it('includes a test naming it in any of the ways tests here read files', () => {
    expect(testsThatRead(['renderer/src/components/Thread.tsx'], root).sort())
      .toEqual(['tests/joined.test.mjs', 'tests/url.test.mjs', 'tests/whole-path.test.mjs']);
  });

  it('does not include a test that reads a file whose name only ends the same', () => {
    expect(testsThatRead(['renderer/src/components/Thread.tsx'], root)).not.toContain('tests/other.test.mjs');
  });

  it('does not include a test that only says the word', () => {
    expect(testsThatRead(['renderer/src/components/Thread.tsx'], root)).not.toContain('tests/word.test.mjs');
  });

  it('is nothing for nothing changed', () => {
    expect(testsThatRead([], root)).toEqual([]);
  });
});

describe('both ship checks use it', () => {
  const here = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  it('the ship script', () => {
    expect(fs.readFileSync(path.join(here, 'scripts', 'ship.mjs'), 'utf8')).toMatch(/testsThatRead\(/);
  });
  it('the push hook', () => {
    expect(fs.readFileSync(path.join(here, 'scripts', 'hooks', 'pre-push'), 'utf8')).toMatch(/tests-that-read\.mjs/);
  });
});
