// Check the actual CLI, not just its planner: paths stay separate arguments,
// failed test processes stay failed, and missing source cannot select zero tests.
import { it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
let root;
const source = fileURLToPath(new URL('../../', import.meta.url));
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-command-'));
  for (const file of ['scripts/test-what-changed.mjs', 'scripts/lib/test-plan.mjs', 'scripts/lib/tests-that-read.mjs']) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.copyFileSync(path.join(source, file), path.join(root, file));
  }
  fs.mkdirSync(path.join(root, 'node_modules/vitest'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules/vitest/vitest.mjs'), "import fs from 'node:fs'; fs.writeFileSync('calls.json', JSON.stringify(process.argv.slice(2))); process.exit(7);");
  fs.mkdirSync(path.join(root, 'main'));
  fs.writeFileSync(path.join(root, 'main/space in name.mjs'), 'export const value = 1;');
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
const run = (...args) => spawnSync(process.execPath, [path.join(root, 'scripts/test-what-changed.mjs'), ...args], { cwd: root, encoding: 'utf8' });
it('preserves a filename containing spaces and the test runner failure status', () => {
  expect(run('main/space in name.mjs').status).toBe(7);
  expect(JSON.parse(fs.readFileSync(path.join(root, 'calls.json'), 'utf8'))).toContain('main/space in name.mjs');
});
it('plans full coverage for explicitly named missing source', () => {
  const result = run('--plan', 'main/deleted.mjs');
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('"mode": "full"');
  expect(fs.existsSync(path.join(root, 'calls.json'))).toBe(false);
});
it('rejects a malformed comparison mode without running tests', () => {
  expect(run('--base').status).toBe(1);
  expect(run('--working', '--base', 'main').status).toBe(1);
  expect(fs.existsSync(path.join(root, 'calls.json'))).toBe(false);
});
