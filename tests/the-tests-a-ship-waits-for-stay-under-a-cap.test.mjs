// A SHIP WAITS FOR A BOUNDED SET OF TESTS, NOT FOR MOST OF THE SUITE.
//
// WHY, 2026-10-19. Ships took 12 to 20 minutes each and the top-priority
// thread waited about two hours to land. Measured on this Mac that evening:
// 1,207 test files, of which 216 name main/supervisor.mjs, 128 name
// renderer/src/styles.css and 73 name main/store.mjs. `vitest related` on a
// core file pulled in 228 files and 2,953 tests. The 93 files a change to
// main/store.mjs pulls in took 77 s at load 16, and the suite ran TWICE per
// ship, so a core change cost 12 minutes before anything was pushed.
//
// Almost all of that is fixed cost per file: of those 77 s, 102 s of fork time
// went on collect and 36 s on prepare, against 197 s actually running tests.
// So the number of FILES is the thing to bound.
//
// The bound here is the one a ship can afford. Over it, the gate runs the test
// files that name the change most, and GitHub — clean machines, in parallel,
// after the push — runs all of them and the rest of the suite.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GATE_CAP, gateFor, vitestArgs } from '../scripts/lib/tests-the-push-runs.mjs';

/** A throwaway checkout whose tests/ holds exactly the files named. */
function checkout(tests) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'push-gate-'));
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true });
  for (const [name, text] of Object.entries(tests)) fs.writeFileSync(path.join(dir, 'tests', name), text);
  return dir;
}

/** `n` test files that each name the file once, the way a sweeping audit does. */
function manyThatName(file, n, prefix = 'audit') {
  const out = {};
  for (let i = 0; i < n; i += 1) out[`${prefix}-${String(i).padStart(3, '0')}.test.mjs`] = `read('${file}');\n`;
  return out;
}

describe('a change only a few tests name', () => {
  const root = checkout({
    'the-store-keeps-a-row.test.mjs': "import { store } from '../main/store.mjs';\n",
    'something-else.test.mjs': "import { other } from '../main/other.mjs';\n",
  });

  it('is gated by every test that imports it, as it always was', () => {
    const gate = gateFor(['main/store.mjs'], root);
    expect(gate.mode).toBe('related');
    expect(vitestArgs(gate)).toEqual([
      'related', '--run', '--passWithNoTests', 'main/store.mjs', 'tests/the-store-keeps-a-row.test.mjs',
    ]);
  });

  it('runs no tests rather than refusing the push when nothing names it at all', () => {
    const gate = gateFor(['main/nobody-tests-this.mjs'], root);
    expect(gate.mode).toBe('related');
    expect(vitestArgs(gate)).toContain('--passWithNoTests');
  });
});

describe('a change most of the suite names', () => {
  const root = checkout({
    ...manyThatName('main/supervisor.mjs', GATE_CAP + 40),
    'the-supervisor-starts-a-worker.test.mjs':
      "import { Supervisor } from '../main/supervisor.mjs';\n// main/supervisor.mjs, main/supervisor.mjs\n",
  });

  const gate = gateFor(['main/supervisor.mjs'], root);

  it('runs the cap and no more, because the push cannot wait for the rest', () => {
    expect(gate.mode).toBe('capped');
    expect(gate.files).toHaveLength(GATE_CAP);
    expect(vitestArgs(gate)[0]).toBe('run');
    expect(vitestArgs(gate)).not.toContain('related');
  });

  it('keeps the tests that are about the change, not a sweep that mentions it once', () => {
    expect(gate.files[0]).toBe('tests/the-supervisor-starts-a-worker.test.mjs');
  });

  it('says how many it left, and who runs them', () => {
    expect(gate.left).toBe(41);
    expect(gate.say).toMatch(/41/);
    expect(gate.say).toMatch(/GitHub/);
  });

  it('picks the same files every time, so a red test can be run again', () => {
    expect(gateFor(['main/supervisor.mjs'], root).files).toEqual(gate.files);
  });
});

describe('the cap itself', () => {
  it('lets a set exactly its size through whole', () => {
    const root = checkout(manyThatName('main/a.mjs', GATE_CAP));
    const gate = gateFor(['main/a.mjs'], root);
    expect(gate.mode).toBe('related');
    expect(gate.left).toBe(0);
  });

  it('bites at one over', () => {
    const root = checkout(manyThatName('main/a.mjs', GATE_CAP + 1));
    const gate = gateFor(['main/a.mjs'], root);
    expect(gate.mode).toBe('capped');
    expect(gate.files).toHaveLength(GATE_CAP);
    expect(gate.left).toBe(1);
  });

  it('is a ship\'s budget, not a law: a caller may set its own', () => {
    const root = checkout(manyThatName('main/a.mjs', 5));
    expect(gateFor(['main/a.mjs'], root, { cap: 3 }).files).toHaveLength(3);
    expect(gateFor(['main/a.mjs'], root, { cap: 99 }).mode).toBe('related');
  });
});

describe('a test file the push itself changes', () => {
  it('runs even when the cap is biting, because it IS the change', () => {
    const root = checkout({
      ...manyThatName('main/a.mjs', GATE_CAP + 10),
      'the-new-one.test.mjs': '// says nothing about anything\n',
    });
    const gate = gateFor(['main/a.mjs', 'tests/the-new-one.test.mjs'], root, { cap: 2 });
    expect(gate.files).toContain('tests/the-new-one.test.mjs');
    expect(gate.files).toHaveLength(2);
  });
});
