// Three of three new Codex threads (QA session 45) left their work uncommitted:
// `git commit` failed on `.git/worktrees/<name>/index.lock: Read-only file
// system`, because Codex keeps a worktree's Git data outside its writable
// sandbox, and the agents called wait_on_cause instead of asking for an
// escalated command. In session 44 the same agents asked and the auto review
// allowed it. Measured by reading the brief each engine gets.
import { it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { workerGitBrief, withWorkerGitBrief } from '../main/worker-git.mts';
import { Supervisor } from '../main/supervisor.mts';

it('tells a Codex worker to commit with escalated permissions and not to wait over the read-only error', () => {
  const brief = workerGitBrief('/a/repository', 'codex');
  expect(brief).toContain('require_escalated');
  expect(brief).toContain('Read-only file system');
  expect(brief).toContain('not a cause to wait on');
});

it('leaves the Claude Code brief and a task with no repository as they were', () => {
  expect(workerGitBrief('/a/repository', 'claude')).not.toContain('require_escalated');
  expect(workerGitBrief('/a/repository')).not.toContain('require_escalated');
  expect(workerGitBrief(null, 'codex')).toBe('');
});

it('carries the Codex lines on a reply without doubling them', () => {
  const once = withWorkerGitBrief('Carry on.', '/a/repository', 'codex');
  expect(once).toContain('require_escalated');
  expect(withWorkerGitBrief(once, '/a/repository', 'codex')).toBe(once);
  expect(fs.readFileSync(new URL('../main/supervisor.mts', import.meta.url), 'utf8')).toContain('withWorkerGitBrief(prompt, product.repoPath, engine)');
});

it('puts the Codex lines in a fresh Codex brief and not in a Claude Code one', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-commit-brief-'));
  try {
    const store = { listItems: () => [], listProducts: () => [], isDue: () => true };
    const supervisor = new Supervisor({ storeRoot: dir }, store, dir);
    const item = { id: 'w-test', product: 'sample', title: 'Add countVowels', labels: [] };
    const product = { slug: 'sample', name: 'Sample', dir, repoPath: dir };
    expect(supervisor.buildBrief(item, product, { engine: 'codex' })).toContain('require_escalated');
    expect(supervisor.buildBrief(item, product, { engine: 'claude' })).not.toContain('require_escalated');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
