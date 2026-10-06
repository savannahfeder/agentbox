// THE TESTS FOR WHAT YOU CHANGED, IN ONE COMMAND (w-89f1e810b4).
//
//   npm run test:changed            # everything this branch changes
//   npm run test:changed a.mjs b.ts # or just these
//
// CLAUDE.md used to say `npx vitest related --run <the files you changed>`,
// and `related` runs the tests that IMPORT a file. Dozens of tests here read
// a source file as TEXT instead, and those are invisible to it: that is how
// three red tests shipped in a359d81, and how a branch bounced five times
// while the agent on it could not reproduce a single failure
// (scripts/lib/tests-that-read.mjs). The ship script and the push hook both
// add the readers; this is the same selection, before either of them runs.
//
// Two forks, like the ship, because a dozen agents share this Mac.
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { testsThatRead } from './lib/tests-that-read.mjs';

const root = (() => {
  try { return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim(); } catch {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  }
})();
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const lines = (s) => s.split('\n').map((l) => l.trim()).filter(Boolean);

/** Everything this branch changes, committed or not, docs aside. */
function changedOnThisBranch() {
  const sets = [];
  try { sets.push(git('diff', '--name-only', 'origin/main...HEAD')); } catch { /* no remote main yet */ }
  try { sets.push(git('diff', '--name-only', 'HEAD'), git('ls-files', '--others', '--exclude-standard')); } catch { /* nothing staged */ }
  return [...new Set(sets.flatMap(lines))].filter((f) => !f.startsWith('docs/'));
}

const named = process.argv.slice(2);
const files = named.length ? named : changedOnThisBranch();
if (!files.length) {
  console.log('test:changed: this branch changes no code, so there is nothing to run.');
  process.exit(0);
}

const readers = testsThatRead(files, root).filter((f) => !files.includes(f));
console.log(`test:changed: ${files.length} changed file(s)${readers.length ? ` and ${readers.length} test(s) that read one as text` : ''}.`);
const run = spawnSync('npx', ['vitest', 'related', '--run', '--passWithNoTests', ...files, ...readers], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, VITEST_MAX_FORKS: process.env.VITEST_MAX_FORKS ?? '2', VITEST_MIN_FORKS: process.env.VITEST_MIN_FORKS ?? '1' },
});
process.exit(run.status ?? 1);
