// Prints {results, peak, atPeak} as JSON: for each query (a list of changed
// files), the test files a discovery picks in <root>, the most file reads it
// ever had open at once, and which files those were.
//   node related-tests-probe.mjs vitest|bounded <root> '<json [[changed...], ...]>'
// `vitest` is Vitest.filterTestsBySource itself, the walk `vitest related` runs.
import fs from 'node:fs';
import path from 'node:path';

const [how, root, queriesJson] = process.argv.slice(2);
const queries = JSON.parse(queriesJson);

const open = new Map();
let peak = 0;
let atPeak = [];
const readFile = fs.promises.readFile;
fs.promises.readFile = async function counted(...args) {
  const key = Symbol('read');
  open.set(key, path.relative(root, String(args[0])));
  if (open.size > peak) { peak = open.size; atPeak = [...open.values()]; }
  try { return await readFile.apply(this, args); } finally { open.delete(key); }
};

const results = [];
if (how === 'vitest') {
  const { createVitest } = await import('vitest/node');
  const vitest = await createVitest('test', { root, watch: false, run: true, passWithNoTests: true, reporters: [] });
  try {
    for (const changed of queries) {
      vitest.config.related = changed.map((f) => path.resolve(root, f));
      const specs = await vitest.globTestSpecs();
      results.push((await vitest.filterTestsBySource(specs))
        .map((s) => path.relative(root, s.moduleId).split(path.sep).join('/')).sort());
    }
  } finally { await vitest.close(); }
} else {
  const { testsTheGraphReaches } = await import('../../scripts/lib/tests-the-graph-reaches.mjs');
  for (const changed of queries) results.push(await testsTheGraphReaches(changed, root));
}
// On macOS a pipe write is async: exiting before it drains cuts the JSON at 8 KB.
process.stdout.write(`${JSON.stringify({ results, peak, atPeak })}\n`, () => process.exit(0));
