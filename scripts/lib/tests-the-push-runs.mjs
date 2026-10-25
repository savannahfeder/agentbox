// THE TESTS A PUSH WAITS FOR, AND THE MOST IT WILL WAIT FOR (w-9e4d3f3cc1).
//
// `vitest related <files>` runs every test that imports what changed, which
// for a core file here is most of the suite: 216 of the 1,207 test files name
// main/supervisor.mjs. That set is the right one to run and the wrong one to
// wait for, so over the cap this hands back the test files that name the
// change most and leaves the rest to GitHub, which runs the whole suite on
// every push.
//
// Usage: node scripts/lib/tests-the-push-runs.mjs <changed files...>
//   prints the vitest arguments, one per line, and says what it chose on
//   stderr.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { testsThatRead } from './tests-that-read.mjs';

// WHY SIXTY. Nearly all of a gate's cost is per FILE, not per test: of the
// 77 s a 93-file run took at load 16, fork time was 102 s collecting and 36 s
// preparing against 197 s running. Sixty files is about a minute at that load
// and about three at the worst load seen here, which leaves a ship inside the
// three minutes it is allowed.
export const GATE_CAP = 60;

const isTest = (f) => /(^|\/)tests\/.+\.test\.mjs$/.test(f);
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** How often a test file says the name of any of these files. */
function namesItHowOften(testFile, changed, root) {
  let text = '';
  try { text = fs.readFileSync(path.join(root, testFile), 'utf8'); } catch { return 0; }
  let n = 0;
  for (const f of changed) {
    n += (text.match(new RegExp(escape(path.basename(f)), 'g')) ?? []).length;
  }
  return n;
}

/**
 * What to run for a push, and whether the whole set fits in a ship's budget.
 *
 * @returns {{
 *   mode: 'related'|'capped', files: string[], named: number, left: number, say: string,
 * }} `related` carries the changed files for vitest to expand; `capped` carries
 *   test files to run as they are.
 */
export function gateFor(changed, root = process.cwd(), { cap = GATE_CAP } = {}) {
  const code = changed.filter(Boolean);
  const named = [...new Set([...code.filter(isTest), ...testsThatRead(code, root)])];
  if (named.length <= cap) {
    return {
      mode: 'related',
      files: [...code, ...named],
      named: named.length,
      left: 0,
      say: `running the tests for the ${code.length} file(s) this push changes, and everything that imports them.`,
    };
  }
  // The change's own test files first: they ARE the change. Then by how much a
  // file is about the change rather than merely mentioning it once, which is
  // what tells a subject's own test from a sweep over every file in the repo.
  const changedTests = new Set(code.filter(isTest));
  const files = [...named]
    .sort((a, b) => (changedTests.has(b) - changedTests.has(a))
      || (namesItHowOften(b, code, root) - namesItHowOften(a, code, root))
      || a.localeCompare(b))
    .slice(0, cap);
  return {
    mode: 'capped',
    files,
    named: named.length,
    left: named.length - cap,
    say: `${named.length} test files name what this push changes, which is more than a ship can wait for `
      + `on this Mac. Running the ${cap} that are most about it; GitHub runs those ${named.length - cap} `
      + 'and the rest of the suite.',
  };
}

/** The arguments to hand vitest for that gate. */
export function vitestArgs(gate) {
  return gate.mode === 'related'
    ? ['related', '--run', '--passWithNoTests', ...gate.files]
    : ['run', '--passWithNoTests', ...gate.files];
}

const invoked = (() => { try { return fs.realpathSync(process.argv[1] ?? ''); } catch { return ''; } })();
if (invoked && invoked === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const gate = gateFor(process.argv.slice(2));
  process.stderr.write(`pre-push: ${gate.say}\n`);
  for (const arg of vitestArgs(gate)) console.log(arg);
}
