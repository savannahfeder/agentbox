// Since the memory reading moved to one long-lived helper shell (2026-11-22),
// everything it holds is unref'd, the reading's own deadline too. In the app
// Electron keeps Node running, but a script whose only work is awaiting a
// reading ended there: the product loop's workday exited at its first memory
// check with "unsettled top-level await", and its test failed on every Mac
// whose push ran the whole suite. Measured by running such a script.
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULE = path.join(ROOT, 'main', 'mac-pressure.mts');

const run = (body: string) => spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e',
  `const { readMacPressure, stopReadingMacPressure } = await import(${JSON.stringify(MODULE)});\n${body}`], { encoding: 'utf8', timeout: 30_000 });

describe('a script that only waits on the memory reading', () => {
  it('stays open until the reading comes back', () => {
    const r = run(`const got = await readMacPressure('darwin'); console.log('answered', typeof got.level);`);
    expect(r.stdout, r.stderr).toContain('answered');
    expect(r.status).toBe(0);
  });

  it('two readings in a row both come back', () => {
    const r = run(`await readMacPressure('darwin'); await readMacPressure('darwin'); console.log('both');`);
    expect(r.stdout, r.stderr).toContain('both');
  });

  it('and is not kept open by the helper once it is done', () => {
    const r = run(`await readMacPressure('darwin'); console.log('done');`);
    expect(r.status).toBe(0);
    expect(r.error).toBeUndefined();
  });
});
