// THE TESTS THAT REACH A FILE THROUGH SOMETHING ELSE, which neither
// `testsThatRead` nor the gate's own count can see.
//
// A test that imports the changed file DIRECTLY quotes its name, so
// scripts/lib/tests-that-read.mjs already finds it. A test that imports
// something that imports it quotes nothing. For main/engine-bin.mjs that is
// the difference between 11 test files and 362, and the gate was sizing a
// ship's three minutes off the 11
// (tests/a-core-change-does-not-hand-the-push-more-tests-than-it-can-run).
//
// This is a reading of the repo's own relative imports, not vitest's module
// graph, and it is used only to decide whether that graph will be too big to
// run and to rank what runs instead. Under the cap the gate still hands the
// job to `vitest related`, which is the accurate answer.
//
// Usage: node scripts/lib/tests-that-import.mjs <changed files...>
//   prints one test file per line.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// `from './x'`, `import './x'`, `import('./x')`. Only relative specifiers:
// a package name is not a file in this repo.
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"](\.[^'"\n]*)['"]/g;

// What this repo writes an extensionless import to mean. Order is the order
// node and vite try them.
const ENDINGS = ['', '.mjs', '.ts', '.tsx', '.js', '.jsx', '.cjs',
  '/index.mjs', '/index.ts', '/index.tsx', '/index.js'];

function resolve(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  for (const end of ENDINGS) {
    const p = base + end;
    try { if (fs.statSync(p).isFile()) return p; } catch { /* try the next ending */ }
  }
  return null;
}

function importsOf(file) {
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch { return []; }
  const out = [];
  for (const m of text.matchAll(SPECIFIER)) {
    const to = resolve(file, m[1]);
    if (to) out.push(to);
  }
  return out;
}

/**
 * Every test file whose imports reach one of `changed`, directly or through
 * any number of other files.
 *
 * Walked backwards: the forward edges are collected once from the test files
 * out, then followed in reverse from the changed files. A cycle is two nodes
 * already seen rather than a recursion that does not end.
 */
export function testsThatImport(changed, root = process.cwd()) {
  const targets = changed.filter(Boolean).map((f) => path.resolve(root, f));
  if (!targets.length) return [];

  let tests = [];
  try {
    tests = fs.readdirSync(path.join(root, 'tests'))
      .filter((f) => f.endsWith('.test.mjs'))
      .map((f) => path.join(root, 'tests', f));
  } catch { return []; }

  const importedBy = new Map();
  const queue = [...tests];
  const seen = new Set(tests);
  while (queue.length) {
    const file = queue.pop();
    for (const to of importsOf(file)) {
      if (!importedBy.has(to)) importedBy.set(to, []);
      importedBy.get(to).push(file);
      if (!seen.has(to)) { seen.add(to); queue.push(to); }
    }
  }

  const reaches = new Set();
  const back = targets.filter((t) => seen.has(t) || importedBy.has(t));
  const walked = new Set(back);
  while (back.length) {
    for (const importer of importedBy.get(back.pop()) ?? []) {
      if (walked.has(importer)) continue;
      walked.add(importer);
      back.push(importer);
      reaches.add(importer);
    }
  }

  return tests.filter((t) => reaches.has(t)).map((t) => path.relative(root, t)).sort();
}

const invoked = (() => { try { return fs.realpathSync(process.argv[1] ?? ''); } catch { return ''; } })();
if (invoked && invoked === fs.realpathSync(fileURLToPath(import.meta.url))) {
  for (const t of testsThatImport(process.argv.slice(2))) console.log(t);
}
