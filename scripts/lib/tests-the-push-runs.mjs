// THE TESTS A PUSH WAITS FOR, AND THE MOST IT WILL WAIT FOR (w-9e4d3f3cc1).
//
// `vitest related <files>` runs every test that imports what changed, which
// for a core file here is most of the suite: 362 of the 1,869 test files reach
// main/engine-bin.mts. That set is the right one to run and the wrong one to
// wait for, so over the cap this hands back the test files that are most about
// the change and leaves the rest to GitHub, which runs the whole suite on
// every push.
//
// A test reaches the change by importing it, by importing something that does
// (scripts/lib/tests-that-import.mjs), or by reading it as text
// (scripts/lib/tests-that-read.mjs). All three count towards the cap: until
// they did, a change to a core file was measured by the few tests that quote
// its name and the ship waited for the hundreds that run.
//
// Usage: node scripts/lib/tests-the-push-runs.mjs <changed files...>
//   prints the vitest arguments, one per line, and says what it chose on
//   stderr.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { testsThatRead } from './tests-that-read.mjs';
import { testsThatImport } from './tests-that-import.mjs';
import { testsTheGraphReaches } from './tests-the-graph-reaches.mjs';

// WHY SIXTY. Nearly all of a gate's cost is per FILE, not per test: of the
// 77 s a 93-file run took at load 16, fork time was 102 s collecting and 36 s
// preparing against 197 s running. Sixty files is about a minute at that load
// and about three at the worst load seen here, which leaves a ship inside the
// three minutes it is allowed.
export const GATE_CAP = 60;

const isTest = (f) => /(^|\/)tests\/.+\.test\.m[jt]s$/.test(f);
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
  // All three roads in, because all three are what `related` would run and so
  // what a ship would wait for.
  const named = [...new Set([
    ...code.filter(isTest), ...testsThatRead(code, root), ...testsThatImport(code, root),
  ])];
  if (named.length <= cap) {
    return {
      mode: 'related',
      files: [...code, ...named],
      named: named.length,
      left: 0,
      say: `running the tests for the ${code.length} file(s) this push changes, and everything that imports them.`,
    };
  }
  return capped(named, code, root, cap);
}

function capped(named, code, root, cap) {
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
    say: `${named.length} test files reach what this push changes, which is more than a ship can wait for `
      + `on this Mac. Running the ${cap} that are most about it; GitHub runs those ${named.length - cap} `
      + 'and the rest of the suite.',
  };
}

/**
 * Every test file a change reaches: its own (where they still exist), those
 * that read it as text or walk its folder, and those whose imports reach it in
 * the repo's own reading or in vitest's module graph.
 */
export async function testsTheChangeReaches(changed, root = process.cwd(), { reaches = testsTheGraphReaches } = {}) {
  const code = changed.filter(Boolean);
  const own = code.filter((f) => isTest(f) && fs.existsSync(path.join(root, f)));
  // A changed test runs itself, and a test that imports it is found by
  // testsThatImport, so a push of only tests need not start vitest.
  const source = code.filter((f) => !isTest(f));
  return [...new Set([
    ...own, ...testsThatRead(code, root), ...testsThatImport(code, root), ...(source.length ? await reaches(source, root) : []),
  ])].sort();
}

/**
 * The gate a push runs: `gateFor`, with vitest's module graph walked here
 * rather than by `vitest related`, which opens every test file at once.
 * Rejects when the graph cannot be walked.
 *
 * @returns {Promise<ReturnType<typeof gateFor> | {
 *   mode: 'listed', files: string[], named: number, left: 0, say: string,
 * }>} `listed` carries test files to run as they are.
 */
export async function gateOnTheGraph(changed, root = process.cwd(), { cap = GATE_CAP, reaches } = {}) {
  const first = gateFor(changed, root, { cap });
  if (first.mode === 'capped') return first;
  const code = changed.filter(Boolean);
  const named = await testsTheChangeReaches(code, root, { reaches });
  if (named.length > cap) return capped(named, code, root, cap);
  return {
    mode: 'listed',
    files: named,
    named: named.length,
    left: 0,
    say: `running the ${named.length} test file(s) that reach the ${code.length} file(s) this push changes.`,
  };
}

// Vitest runs every test when it is given no file at all, so an empty list is
// a name that matches none.
const NO_TEST = '__no_test_reaches_this_change__';
// An option vitest does not know stops it before it looks for a test, so no
// file name can turn this green.
export const REFUSE_ARGS = ['run', '--the-push-could-not-work-out-its-tests'];

/** The arguments to hand vitest for that gate. */
export function vitestArgs(gate) {
  if (gate.mode === 'related') return ['related', '--run', '--passWithNoTests', ...gate.files];
  return ['run', '--passWithNoTests', ...(gate.files.length ? gate.files : [NO_TEST])];
}

const invoked = (() => { try { return fs.realpathSync(process.argv[1] ?? ''); } catch { return ''; } })();
if (invoked && invoked === fs.realpathSync(fileURLToPath(import.meta.url))) {
  // Exit once stdout is written: a pipe on macOS is written asynchronously, and
  // vite can leave handles open that would keep the process alive.
  const printThenExit = (lines, code) => process.stdout.write(lines.map((l) => `${l}\n`).join(''), () => process.exit(code));
  // The hook falls back to `vitest related` when this prints nothing, so a
  // failure prints arguments that fail instead.
  let gate;
  try {
    gate = await gateOnTheGraph(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`pre-push: could not work out which tests reach this push (${err?.stack ?? err}).\n`);
    printThenExit(REFUSE_ARGS, 1);
  }
  if (gate) {
    process.stderr.write(`pre-push: ${gate.say}\n`);
    printThenExit(vitestArgs(gate), 0);
  }
}
