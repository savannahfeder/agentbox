// A CORE CHANGE DOES NOT HAND THE PUSH MORE TESTS THAN IT CAN RUN.
//
// WHAT BROKE. A one-function change to main/engine-bin.mjs bounced three ships
// in a row, each time with "the test run died without naming a failing test"
// and a different last line of stderr: a React warning, a console.warn from
// the supervisor, a component frame. Nothing was red. Measured here on the
// same branch: all 362 test files the gate hands over pass, 4,529 tests.
//
// WHY. `gateFor` counts `named` -- the change's own test files plus the tests
// that read it as TEXT -- and caps that at GATE_CAP, 60, which is about the
// three minutes a ship is allowed. For that change `named` was 11, under the
// cap, so the gate took the `related` road: it handed the changed files to
// `vitest related`, which expands them through the import graph and runs the
// lot. main/engine-bin.mjs is reached by 362 of the 1,869 test files, six
// times the cap, and that run is what kept being killed.
//
// So the cap guarded the small road and not the big one. The gap is
// TRANSITIVE importers: a test that imports the changed file directly already
// quotes its name, so `testsThatRead` catches it. A test that imports
// something that imports it quotes nothing, and only the graph knows.
//
// `testsThatImport` walks that graph, and the cap now applies to both roads.
// Under the cap nothing changes and vitest's own graph is still what runs.

import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gateFor, GATE_CAP } from '../scripts/lib/tests-the-push-runs.mjs';
import { testsThatImport } from '../scripts/lib/tests-that-import.mjs';

const made = [];
afterAll(() => { for (const d of made) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } } });

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'push-gate-'));
  made.push(dir);
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'main'), { recursive: true });
  return dir;
}
const put = (dir, rel, text) => {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
  return p;
};

/**
 * `howMany` test files that reach main/core.mjs only through main/wrapper.mjs,
 * so none of them quotes the changed file's name and `testsThatRead` finds
 * none of them. That indirection is the real shape: of the 362 that reach
 * main/engine-bin.mjs, 11 name it.
 */
function reachingThroughAWrapper(howMany) {
  const dir = repo();
  put(dir, 'main/core.mjs', 'export const core = 1;\n');
  put(dir, 'main/wrapper.mjs', "export { core } from './core.mjs';\n");
  for (let i = 0; i < howMany; i++) {
    put(dir, `tests/far-${i}.test.mjs`, "import { core } from '../main/wrapper.mjs';\nexport default core;\n");
  }
  return dir;
}

describe('the gate when a change is reached by more tests than it can run', () => {
  // THE REPORTED CASE.
  it('runs the cap and leaves the rest to GitHub, instead of handing over all of them', () => {
    const dir = reachingThroughAWrapper(100);
    const gate = gateFor(['main/core.mjs'], dir, { cap: 10 });
    expect(gate.mode).toBe('capped');
    expect(gate.files).toHaveLength(10);
    expect(gate.named).toBe(100);
    expect(gate.left).toBe(90);
    for (const f of gate.files) expect(f).toMatch(/^tests\/far-\d+\.test\.mjs$/);
  });

  // THE BOUNDARY EITHER SIDE OF THE CAP. At the cap the gate is unchanged:
  // `related` means vitest's own graph decides, which is more accurate than
  // any walk this repo writes, and under the cap there is room for it.
  it('still takes the related road when the whole closure fits', () => {
    const dir = reachingThroughAWrapper(10);
    expect(gateFor(['main/core.mjs'], dir, { cap: 10 }).mode).toBe('related');
  });

  it('turns over to the capped road at one more than the cap', () => {
    const dir = reachingThroughAWrapper(11);
    expect(gateFor(['main/core.mjs'], dir, { cap: 10 }).mode).toBe('capped');
  });

  // THE CASE THAT MUST NOT MATCH: a test that imports something else is not
  // dragged in, or the cap would be spent on tests about nothing.
  it('leaves out a test that reaches none of the changed files', () => {
    const dir = reachingThroughAWrapper(2);
    put(dir, 'main/elsewhere.mjs', 'export const other = 2;\n');
    put(dir, 'tests/unrelated.test.mjs', "import { other } from '../main/elsewhere.mjs';\nexport default other;\n");
    const gate = gateFor(['main/core.mjs'], dir, { cap: 10 });
    expect(gate.files).not.toContain('tests/unrelated.test.mjs');
    expect(gate.named).toBe(2);
  });
});

describe('the walk itself', () => {
  it('follows a chain of any length', () => {
    const dir = repo();
    put(dir, 'main/core.mjs', 'export const core = 1;\n');
    put(dir, 'main/b.mjs', "export { core } from './core.mjs';\n");
    put(dir, 'main/a.mjs', "export { core } from './b.mjs';\n");
    put(dir, 'tests/deep.test.mjs', "import { core } from '../main/a.mjs';\nexport default core;\n");
    expect(testsThatImport(['main/core.mjs'], dir)).toEqual(['tests/deep.test.mjs']);
  });

  // Two files that import each other is an ordinary shape here, and a walk
  // that does not expect it never returns.
  it('comes back from a cycle', () => {
    const dir = repo();
    put(dir, 'main/core.mjs', "import './loop.mjs';\nexport const core = 1;\n");
    put(dir, 'main/loop.mjs', "import './core.mjs';\nexport const loop = 2;\n");
    put(dir, 'tests/looped.test.mjs', "import { loop } from '../main/loop.mjs';\nexport default loop;\n");
    expect(testsThatImport(['main/core.mjs'], dir)).toEqual(['tests/looped.test.mjs']);
  });

  // The renderer is TypeScript and imports its own files without an
  // extension, which is most of what a walk over this repo has to resolve.
  it('resolves a .ts, a .tsx and a folder index written without an extension', () => {
    const dir = repo();
    put(dir, 'renderer/src/types.ts', 'export type A = 1;\n');
    put(dir, 'renderer/src/components/Thread.tsx', "export { } from '../types';\n");
    put(dir, 'renderer/src/team/index.ts', "export { } from '../components/Thread';\n");
    put(dir, 'tests/typed.test.mjs', "import '../renderer/src/team';\n");
    expect(testsThatImport(['renderer/src/types.ts'], dir)).toEqual(['tests/typed.test.mjs']);
  });

  it('says nothing when nothing reaches the file', () => {
    const dir = repo();
    put(dir, 'main/core.mjs', 'export const core = 1;\n');
    put(dir, 'tests/alone.test.mjs', 'export default 1;\n');
    expect(testsThatImport(['main/core.mjs'], dir)).toEqual([]);
  });
});

// THE INCIDENT, against this repository rather than a fixture.
describe('the change that bounced three ships', () => {
  it('is capped rather than handed over whole', () => {
    const root = path.resolve(import.meta.dirname, '..');
    const reached = testsThatImport(['main/engine-bin.mjs'], root);
    // Said out loud so a repo that shrinks cannot quietly pass this.
    expect(reached.length).toBeGreaterThan(GATE_CAP);
    expect(gateFor(['main/engine-bin.mjs'], root).mode).toBe('capped');
  });
});
