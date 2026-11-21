// THE TESTS VITEST'S MODULE GRAPH SAYS REACH A FILE, read a few files at a time.
//
// This is the answer `vitest related` gives, worked out the same way: vite
// transforms each module, and every import it reports, static or dynamic, is
// resolved by vite's own resolver. `vitest related` starts that walk for every
// test file at once with nothing holding it back, and each step opens a file,
// so with 3,400 test files it runs out of open files on a machine whose limit
// is 1,024. Here every module is transformed once, and never more than
// OPEN_AT_ONCE at a time.
//
// Usage: node scripts/lib/tests-the-graph-reaches.mjs <changed files...>
//   prints one test file per line.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Each module in flight holds at most one file open while vite reads it.
export const OPEN_AT_ONCE = 32;

/**
 * Every module reachable from `starts`, and what each imports.
 *
 * `depsOf` is called once per module, never with more than `inFlight` calls
 * unfinished. A module whose deps cannot be read is kept in `broken`: nobody
 * can say what it reaches, so a caller must count it as reaching everything.
 *
 * @param {string[]} starts
 * @param {(file: string) => Promise<string[]>} depsOf
 * @returns {Promise<{ edges: Map<string, string[]>, broken: Map<string, unknown> }>}
 */
export async function walkTheGraph(starts, depsOf, { inFlight = OPEN_AT_ONCE } = {}) {
  checkBound(inFlight);
  const edges = new Map();
  const broken = new Map();
  const seen = new Set(starts);
  const queue = [...seen];
  let next = 0;
  let waiting = [];
  let running = 0;

  const worker = async () => {
    for (;;) {
      if (next < queue.length) {
        const file = queue[next++];
        running += 1;
        try {
          const deps = await depsOf(file);
          edges.set(file, deps);
          for (const d of deps) if (!seen.has(d)) { seen.add(d); queue.push(d); }
        } catch (err) {
          edges.set(file, []);
          broken.set(file, err);
        }
        running -= 1;
        const wake = waiting;
        waiting = [];
        for (const w of wake) w();
      } else if (running === 0) {
        const wake = waiting;
        waiting = [];
        for (const w of wake) w();
        return;
      } else {
        // Idle until another worker finishes and may have queued more.
        await new Promise((r) => waiting.push(r));
      }
    }
  };
  await Promise.all(Array.from({ length: inFlight }, worker));
  return { edges, broken };
}

// NaN or 0 workers would walk nothing and so select no tests at all.
function checkBound(inFlight) {
  if (!Number.isSafeInteger(inFlight) || inFlight < 1) {
    throw new RangeError(`inFlight must be a whole number from 1 up, not ${inFlight}`);
  }
}

/** The starts whose imports, at any depth, reach one of `targets` or a broken module. */
export function startsThatReach(starts, { edges, broken }, targets) {
  const importedBy = new Map();
  for (const [from, deps] of edges) {
    for (const to of deps) {
      if (!importedBy.has(to)) importedBy.set(to, []);
      importedBy.get(to).push(from);
    }
  }
  const back = [...new Set([...targets, ...broken.keys()])];
  const reached = new Set(back);
  while (back.length) {
    for (const importer of importedBy.get(back.pop()) ?? []) {
      if (!reached.has(importer)) { reached.add(importer); back.push(importer); }
    }
  }
  return starts.filter((s) => reached.has(s));
}

/**
 * What one module imports, the way Vitest.getTestDependencies reads it in
 * vitest 2.1: vite's transform, then vite's resolver. Unlike vitest, a module
 * with no transform throws, so the walk counts it as reaching everything.
 */
export function depsFromVite(project) {
  return async (file) => {
    const mod = project.server.moduleGraph.getModuleById(file);
    const transformed = mod?.ssrTransformResult || await project.vitenode.transformRequest(file);
    if (!transformed) throw new Error('vite gave no transform');
    const found = [];
    for (const dep of [...(transformed.deps || []), ...(transformed.dynamicDeps || [])]) {
      const resolved = await project.server.pluginContainer.resolveId(dep, file, { ssr: true });
      const fsPath = resolved && !resolved.external && resolved.id.split('?')[0];
      if (fsPath && !fsPath.includes('node_modules') && fs.existsSync(fsPath)) found.push(fsPath);
    }
    return found;
  };
}

/**
 * The test files, repo-relative and sorted, that `vitest related <changed>`
 * would run in `root`.
 *
 * Throws when vitest cannot start; a caller must not read that as "none".
 */
export async function testsTheGraphReaches(changed, root = process.cwd(), { inFlight = OPEN_AT_ONCE } = {}) {
  checkBound(inFlight);
  const { createVitest } = await import('vitest/node');
  const vitest = await createVitest('test', { root, watch: false, run: true, passWithNoTests: true, reporters: [] });
  try {
    const specs = await vitest.globTestSpecs();
    const rel = (f) => path.relative(root, f).split(path.sep).join('/');
    const targets = changed.filter(Boolean).map((f) => path.resolve(root, f));

    // A force-rerun trigger (a package.json, a setup file) makes
    // filterTestsBySource hand back the very list it was given, before it
    // walks anything; given an empty list, that is its whole answer.
    vitest.config.related = targets;
    const asked = [];
    if (targets.length && await vitest.filterTestsBySource(asked) === asked) {
      return [...new Set(specs.map((s) => rel(s.moduleId)))].sort();
    }

    const out = new Set();
    const byProject = new Map();
    for (const s of specs) {
      const project = s.project.workspaceProject;
      if (!byProject.has(project)) byProject.set(project, []);
      byProject.get(project).push(s.moduleId);
    }
    for (const [project, starts] of byProject) {
      const graph = await walkTheGraph(starts, depsFromVite(project), { inFlight });
      for (const [file, err] of graph.broken) {
        process.stderr.write(`tests-the-graph-reaches: could not read ${rel(file)} (${err?.code ?? err?.message ?? err}), so every test that reaches it counts.\n`);
      }
      for (const s of startsThatReach(starts, graph, targets)) out.add(rel(s));
    }
    return [...out].sort();
  } finally {
    await vitest.close();
  }
}

const invoked = (() => { try { return fs.realpathSync(process.argv[1] ?? ''); } catch { return ''; } })();
if (invoked && invoked === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const found = await testsTheGraphReaches(process.argv.slice(2));
  process.stdout.write(found.map((t) => `${t}\n`).join(''), () => process.exit(0));
}
