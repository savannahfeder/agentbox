// FINDING THE TESTS A CHANGE REACHES OPENS A FEW FILES AT A TIME.
//
// What broke, 2026-11-21: on a cloud machine whose open-file limit is 1,024,
// soft and hard, a push carrying one changed test file was refused before any
// test ran. The hook handed that file to `vitest related`, whose
// Vitest.filterTestsBySource walks the imports of all 3,427 test files at once
// with nothing holding it back, and vite opens a file at every step: EMFILE,
// twice. `npm run test:changed` ran the same command. Measured on main 598baca7e
// in that worktree: `vitest related --run tests/a-run-saves-what-it-changed.test.mts`
// died in 11 s with EMFILE, exit 1.
//
// The selector now walks vitest's own module graph itself, OPEN_AT_ONCE
// modules at a time, and hands vitest an exact list. These tests hold it to
// the same answer vitest gives on small graphs, to the bound, and to failing
// closed: a module nobody can read counts as reaching everything, and a walk
// that cannot start refuses the push.
import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  OPEN_AT_ONCE, depsFromVite, startsThatReach, testsTheGraphReaches, walkTheGraph,
} from '../scripts/lib/tests-the-graph-reaches.mjs';
import { gateOnTheGraph, testsTheChangeReaches, vitestArgs } from '../scripts/lib/tests-the-push-runs.mjs';

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROBE = path.join(here, 'tests/fixtures/related-tests-probe.mjs');
const VITEST = path.join(here, 'node_modules/.bin/vitest');
const SELECTOR = path.join(here, 'scripts/lib/tests-the-push-runs.mjs');

const made: string[] = [];
afterAll(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });

function fixture(files: Record<string, string>, config = 'export default { test: { include: ["tests/**/*.test.{mjs,mts}"] } };\n') {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'graph-reach-')));
  made.push(dir);
  const all = { 'vitest.config.mjs': typeof config === 'function' ? config(dir) : config, ...files };
  for (const [rel, text] of Object.entries(all)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}

type Probe = { results: string[][]; peak: number };
function probe(how: 'vitest' | 'bounded', root: string, queries: string[][], ulimit?: number) {
  const cmd = `${ulimit ? `ulimit -n ${ulimit} && ` : ''}exec "${process.execPath}" "$@"`;
  const r = spawnSync('sh', ['-c', cmd, 'probe', PROBE, how, root, JSON.stringify(queries)], { encoding: 'utf8', timeout: 120_000 });
  return { code: r.status, out: `${r.stdout}${r.stderr}`, parsed: r.status === 0 ? JSON.parse(r.stdout.trim().split('\n').pop()!) as Probe : null };
}

describe('the bounded walk gives the answer Vitest.filterTestsBySource gives', () => {
  const root = fixture({
    'src/core.mjs': 'export const core = 1;\n',
    'src/mid.mjs': "export { core } from './core.mjs';\n",
    'tests/transitive.test.mjs': "import { core } from '../src/mid.mjs';\nexport default core;\n",
    'src/dyn.mjs': 'export const dyn = 1;\n',
    'tests/dynamic.test.mjs': "export async function later() { return import('../src/dyn.mjs'); }\n",
    'lib/aliased.mjs': 'export const aliased = 1;\n',
    'tests/alias.test.mjs': "import { aliased } from '@lib/aliased.mjs';\nexport default aliased;\n",
    'src/loop-a.mjs': "import './loop-b.mjs';\nexport const a = 1;\n",
    'src/loop-b.mjs': "import './loop-a.mjs';\nexport const b = 1;\n",
    'tests/cycle.test.mjs': "import '../src/loop-b.mjs';\n",
    'tests/own.test.mjs': '// imports nothing\n',
    'tests/missing.test.mjs': "import '../src/missing.mjs';\n",
    'src/types.mts': 'export type Shape = { n: number };\n',
    'tests/typed.test.mts': "import type { Shape } from '../src/types.mts';\nexport const s: Shape = { n: 1 };\n",
    'src/elsewhere.mjs': 'export const other = 1;\n',
    'tests/unrelated.test.mjs': "import { other } from '../src/elsewhere.mjs';\nexport default other;\n",
    'sub/package.json': '{}\n',
    'tests/setup.mjs': '// runs before each test file\n',
  }, (dir: string) => `export default { resolve: { alias: { '@lib': ${JSON.stringify(path.join(dir, 'lib'))} } }, test: { include: ["tests/**/*.test.{mjs,mts}"], setupFiles: ["tests/setup.mjs"] } };\n`);

  const queries = [
    ['src/core.mjs'], ['src/dyn.mjs'], ['lib/aliased.mjs'], ['src/loop-a.mjs'], ['tests/own.test.mjs'],
    ['src/missing.mjs'], ['src/gone.mjs'], ['src/types.mts'],
    ['sub/package.json'], ['package.json'], ['tests/setup.mjs'],
    ['tools/vite.config.ts'], ['package.json.bak'], ['src/package.json.mjs'],
  ];
  const expected = [
    ['tests/transitive.test.mjs'], ['tests/dynamic.test.mjs'], ['tests/alias.test.mjs'], ['tests/cycle.test.mjs'],
    ['tests/own.test.mjs'],
    // vitest counts only modules that exist, so a missing or deleted one reaches nothing here;
    // the gate adds the tests that name it.
    [], [],
    // A type-only import is erased before vite sees it, so no test runs it.
    [],
  ];
  const everything = [
    'tests/alias.test.mjs', 'tests/cycle.test.mjs', 'tests/dynamic.test.mjs', 'tests/missing.test.mjs',
    'tests/own.test.mjs', 'tests/transitive.test.mjs', 'tests/typed.test.mts', 'tests/unrelated.test.mjs',
  ];

  const ours = probe('bounded', root, queries);
  const theirs = probe('vitest', root, queries);

  it('runs both', () => {
    expect(ours.code).toBe(0);
    expect(theirs.code).toBe(0);
  });

  it('matches vitest on every shape, query by query', () => {
    expect(ours.parsed!.results).toEqual(theirs.parsed!.results);
  });

  it('follows transitive, dynamic and aliased imports and cycles, and finds a changed test itself', () => {
    expect(ours.parsed!.results.slice(0, expected.length)).toEqual(expected);
  });

  // Vitest's own triggers: a package.json anywhere, or a setup file, reruns
  // every test. Its `**/{vitest,vite}.config.*/**` glob reads as though it
  // matches a config file and, in vitest's micromatch, does not.
  it('reads the force-rerun globs the way vitest does', () => {
    const triggers = ours.parsed!.results.slice(expected.length);
    expect(triggers.slice(0, 3)).toEqual([everything, everything, everything]);
    expect(triggers.slice(3)).toEqual([[], [], []]);
  });
});

describe('how many files it opens at once', () => {
  const many: Record<string, string> = { 'src/base.mjs': 'export const base = 1;\n' };
  for (let i = 0; i < 300; i += 1) {
    many[`src/m-${i}.mjs`] = `export { base } from './base.mjs';\nexport const n = ${i};\n`;
    many[`tests/t-${i}.test.mjs`] = `import { base } from '../src/m-${i}.mjs';\nexport default base;\n`;
  }
  const root = fixture(many);
  const all = Array.from({ length: 300 }, (_, i) => `tests/t-${i}.test.mjs`).sort();

  // THE REPORTED CASE, scaled down: vitest opens every test file at once.
  it('vitest opens far more than the bound, and dies under a limit the bounded walk lives under', () => {
    const theirs = probe('vitest', root, [['src/base.mjs']]);
    expect(theirs.code).toBe(0);
    expect(theirs.parsed!.peak).toBeGreaterThan(OPEN_AT_ONCE * 4);
    expect(theirs.parsed!.results[0]).toEqual(all);

    const limited = probe('vitest', root, [['src/base.mjs']], 150);
    expect(limited.code).not.toBe(0);
    expect(limited.out).toMatch(/EMFILE/);
  });

  it('the bounded walk never has more than OPEN_AT_ONCE reads open, and finds the same tests', () => {
    const ours = probe('bounded', root, [['src/base.mjs']], 150);
    expect(ours.code).toBe(0);
    expect(ours.parsed!.peak).toBeLessThanOrEqual(OPEN_AT_ONCE);
    expect(ours.parsed!.results[0]).toEqual(all);
  });
});

describe('the walk itself', () => {
  function graph(n: number) {
    const deps = new Map<string, string[]>();
    for (let i = 0; i < n; i += 1) deps.set(`m${i}`, [`m${(i * 7 + 1) % n}`, `m${(i * 13 + 5) % n}`]);
    return deps;
  }

  it('holds the number of reads in flight to the bound, and reads each module once', async () => {
    const deps = graph(500);
    let open = 0;
    let peak = 0;
    const calls = new Map<string, number>();
    const result = await walkTheGraph(['m0', 'm1', 'm2', 'm3'], async (f: string) => {
      calls.set(f, (calls.get(f) ?? 0) + 1);
      open += 1;
      peak = Math.max(peak, open);
      await new Promise((r) => setTimeout(r, 1));
      open -= 1;
      return deps.get(f)!;
    }, { inFlight: 8 });
    expect(peak).toBeLessThanOrEqual(8);
    expect(peak).toBe(8);
    expect([...calls.values()].every((n) => n === 1)).toBe(true);
    expect(result.edges.size).toBe(calls.size);
  });

  it('refuses a bound that is not a whole number above zero, rather than walking nothing', async () => {
    for (const inFlight of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(walkTheGraph(['a'], async () => [], { inFlight })).rejects.toThrow(RangeError);
      await expect(testsTheGraphReaches(['a.mjs'], here, { inFlight })).rejects.toThrow(RangeError);
    }
  });

  it('counts a module it cannot read as reaching everything', async () => {
    const deps: Record<string, string[]> = { 't1': ['bad'], 't2': ['fine'], 'fine': [] };
    const walked = await walkTheGraph(['t1', 't2'], async (f: string) => {
      if (f === 'bad') throw new Error('unreadable');
      return deps[f];
    });
    expect([...walked.broken.keys()]).toEqual(['bad']);
    expect(startsThatReach(['t1', 't2'], walked, ['nothing-changed-here'])).toEqual(['t1']);
  });

  it('counts a module vite gives no transform for as one it cannot read', async () => {
    const project = {
      server: { moduleGraph: { getModuleById: () => undefined }, pluginContainer: { resolveId: async () => null } },
      vitenode: { transformRequest: async () => undefined },
    };
    await expect(depsFromVite(project)('/x/tests/a.test.mjs')).rejects.toThrow(/no transform/);
  });
});

describe('a walk that cannot read or cannot start', () => {
  it('runs every test that reaches a module vite cannot transform', async () => {
    const root = fixture({
      'src/broken.mjs': 'export const = ;\n',
      'src/fine.mjs': 'export const fine = 1;\n',
      'tests/reads-broken.test.mjs': "import '../src/broken.mjs';\n",
      'tests/clean.test.mjs': "import '../src/fine.mjs';\n",
      'tests/apart.test.mjs': '// imports nothing\n',
    });
    const ours = probe('bounded', root, [['src/fine.mjs']]);
    expect(ours.code).toBe(0);
    expect(ours.parsed!.results[0]).toEqual(['tests/clean.test.mjs', 'tests/reads-broken.test.mjs']);
    expect(ours.out).toMatch(/could not read src\/broken\.mjs/);
  });

  it('refuses the push when vitest itself will not start', () => {
    const root = fixture({ 'tests/a.test.mjs': '// a\n', 'src/a.mjs': 'export const a = 1;\n' },
      'throw new Error("this config does not load");\n');
    const r = spawnSync(process.execPath, [SELECTOR, 'src/a.mjs'], { cwd: root, encoding: 'utf8', timeout: 120_000 });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/could not work out/);
    const args = r.stdout.trim().split('\n');
    expect(args).not.toContain('related');
    expect(args).not.toContain('--passWithNoTests');

    // Those arguments fail a real vitest run, so the hook refuses, even in a
    // repo whose green test is named after the refusal itself.
    const green = "import { it } from 'vitest';\nit('runs', () => {});\n";
    const name = args.slice(1).join('').replace(/^-+/, '');
    const clean = fixture({ 'tests/a.test.mjs': green, [`tests/${name}.test.mjs`]: green, [`tests/__${name}__.test.mjs`]: green });
    const ran = spawnSync(VITEST, [...args, '--reporter=basic', '--root', clean], { cwd: here, encoding: 'utf8', timeout: 120_000 });
    expect(ran.status).toBe(1);
    expect(`${ran.stdout}${ran.stderr}`).toMatch(/Unknown option/);
    expect(`${ran.stdout}${ran.stderr}`).not.toMatch(/passed/);
  });
});

describe('the gate built on it', () => {
  const root = fixture({
    'src/core.mjs': 'export const core = 1;\n',
    'src/mid.mjs': "export { core } from './core.mjs';\n",
    'src/style.css': 'body {}\n',
    'tests/transitive.test.mjs': "import { core } from '../src/mid.mjs';\nexport default core;\n",
    'tests/reads-the-css.test.mjs': "const css = read('src/style.css');\n",
    'tests/walks-src.test.mjs': "fs.readdirSync(path.join(root, 'src'));\n",
    'tests/names-the-gone-one.test.mjs': "const gone = 'lib/gone.mjs';\n",
    'tests/own.test.mjs': '// imports nothing\n',
    'tests/unrelated.test.mjs': '// nothing\n',
  });
  const graphSays = (answer: string[]) => async () => answer;

  it('lists the graph, the text readers, the folder walkers and the changed test, and nothing else', async () => {
    const gate = await gateOnTheGraph(['src/core.mjs', 'src/style.css', 'src/new.mjs', 'tests/own.test.mjs'], root, { reaches: graphSays(['tests/transitive.test.mjs']) });
    expect(gate.mode).toBe('listed');
    expect(gate.files).toEqual(['tests/own.test.mjs', 'tests/reads-the-css.test.mjs', 'tests/transitive.test.mjs', 'tests/walks-src.test.mjs']);
    expect(vitestArgs(gate)).toEqual(['run', '--passWithNoTests', ...gate.files]);
  });

  it('keeps the tests that name a deleted source, which the graph cannot see', async () => {
    expect(await testsTheChangeReaches(['lib/gone.mjs'], root, { reaches: graphSays([]) })).toEqual(['tests/names-the-gone-one.test.mjs']);
  });

  it('runs the real walk end to end', async () => {
    const gate = await gateOnTheGraph(['src/core.mjs'], root);
    expect(gate.files).toEqual(['tests/transitive.test.mjs', 'tests/walks-src.test.mjs']);
  });

  it('caps what the graph finds, not just what the static reading finds', async () => {
    const found = Array.from({ length: 12 }, (_, i) => `tests/g-${String(i).padStart(2, '0')}.test.mjs`);
    const gate = await gateOnTheGraph(['src/core.mjs'], root, { cap: 10, reaches: graphSays(found) });
    expect(gate.mode).toBe('capped');
    expect(gate.files).toHaveLength(10);
    expect(gate.left).toBe(4);
  });

  it('runs nothing, and passes, when no test reaches the change', async () => {
    const gate = await gateOnTheGraph(['lib/nobody.mjs'], root, { reaches: graphSays([]) });
    expect(gate.files).toEqual([]);
    const args = vitestArgs(gate);
    expect(args).not.toContain('related');
    const ran = spawnSync(VITEST, [...args, '--root', root], { cwd: here, encoding: 'utf8', timeout: 120_000 });
    expect(ran.status).toBe(0);
    expect(`${ran.stdout}${ran.stderr}`).toMatch(/No test files found/);
  });

  it('is what the selector prints for the hook', () => {
    const out = execFileSync(process.execPath, [SELECTOR, 'src/core.mjs'], { cwd: root, encoding: 'utf8', timeout: 120_000 });
    expect(out.trim().split('\n')).toEqual(['run', '--passWithNoTests', 'tests/transitive.test.mjs', 'tests/walks-src.test.mjs']);
  });
});
