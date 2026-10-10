// Local selection previously always included ancestor changes and excluded docs.
// Use real Git repos to distinguish working changes, a stacked base, and unsafe selections.
import { it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { collectChanges, planTests } from '../../scripts/lib/test-plan.mjs';
let root;
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
function write(file, text = '') {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), text);
}
function commit() {
  git('add', '.');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture');
  return git('rev-parse', 'HEAD');
}
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-plan-'));
  git('init', '-q');
  write('main/first.mjs', 'export const first = 1;');
  commit();
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
it('limits an iteration to staged, unstaged, and untracked files', () => {
  write('main/committed.mjs'); commit();
  write('main/first.mjs', 'export const first = 2;'); git('add', '.');
  write('main/space in name.mjs');
  expect(collectChanges({ root, working: true }).files.sort()).toEqual(['main/first.mjs', 'main/space in name.mjs']);
});
it('measures a stack from the selected parent rather than including its package change', () => {
  write('package.json', '{}'); const base = commit();
  write('main/next.mjs'); commit();
  expect(collectChanges({ root, base }).files).toEqual(['main/next.mjs']);
});
it('includes a nested test that reads a changed guide as text', () => {
  write('tests/docs/guide.test.mjs', "readFileSync('docs/guide.md')");
  const plan = planTests({ root, files: ['docs/guide.md'] });
  expect(plan.mode).toBe('related');
  expect(plan.readers).toEqual(['tests/docs/guide.test.mjs']);
});
it('runs the full suite for dependencies or shared test setup', () => {
  for (const file of ['package-lock.json', 'vitest.config.mjs', 'tests/agentbox-home.setup.mjs']) {
    expect(planTests({ root, files: [file] }).mode).toBe('full');
  }
});
it('runs the full suite for deleted source instead of trusting the remaining import graph', () => {
  fs.rmSync(path.join(root, 'main/first.mjs'));
  const changes = collectChanges({ root, working: true });
  expect(changes.deleted).toEqual(['main/first.mjs']);
  expect(planTests({ root, ...changes }).mode).toBe('full');
  for (const file of ['shared/types.d.mts', 'shared/legacy.cts']) {
    expect(planTests({ root, files: [file], deleted: [file] }).mode).toBe('full');
  }
});
it('does not silently pass if its comparison base is invalid', () => {
  expect(() => collectChanges({ root, base: 'missing-ref' })).toThrow(/base/i);
});
it('falls back to full coverage when no default comparison can be resolved', () => {
  expect(planTests({ root, ...collectChanges({ root }) }).mode).toBe('full');
});
it('does nothing for a clean working tree', () => {
  expect(planTests({ root, ...collectChanges({ root, working: true }) }).mode).toBe('none');
});
it('retains directly changed tests as inputs to the runner', () => {
  const plan = planTests({ root, files: ['tests/tooling/example.test.mjs'] });
  expect(plan.files).toEqual(['tests/tooling/example.test.mjs']);
});
