// A first commit failed after approval and the retry invented an author. Check the brief and Git preflight.
import { it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { COMMIT_IDENTITY_CHECK, workerGitBrief, withWorkerGitBrief } from '../main/worker-git.mjs';
import { Supervisor } from '../main/supervisor.mjs';

it('does not give Git work to a task without a repository', () => {
  expect(workerGitBrief(null)).toBe('');
});

it('refreshes commit instructions on resumed turns without duplicating a fresh brief', () => {
  const prompt = withWorkerGitBrief('Carry on with this reply.', '/a/repository');
  expect(prompt).toContain(COMMIT_IDENTITY_CHECK);
  expect(withWorkerGitBrief(prompt, '/a/repository')).toBe(prompt);
  expect(withWorkerGitBrief('A personal task.', null)).toBe('A personal task.');
  expect(fs.readFileSync(new URL('../main/supervisor.mjs', import.meta.url), 'utf8').includes('prompt = withWorkerGitBrief(prompt, product.repoPath)')).toBe(true);
});

it('requires identity before approval and batches one commit request', () => {
  const brief = workerGitBrief('/a/repository');
  expect(brief).toContain(COMMIT_IDENTITY_CHECK);
  expect(brief).toContain('ask which name and email to use');
  expect(brief).toContain('Never invent an author');
  expect(brief).toContain('one approval request');
  expect(brief).toContain('Do not add user.name or user.email overrides');
  expect(fs.readFileSync(new URL('../main/supervisor.mjs', import.meta.url), 'utf8')).toContain('workerGitBrief(product.repoPath)');
});

it('includes the commit checks for both engines even with custom worker instructions', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-brief-'));
  try {
    fs.mkdirSync(path.join(dir, 'briefs'));
    fs.writeFileSync(path.join(dir, 'briefs', 'worker.md'), 'Custom worker instructions.');
    const store = { listItems: () => [], listProducts: () => [], isDue: () => true };
    const supervisor = new Supervisor({ storeRoot: dir }, store, dir);
    const item = { id: 'w-test', product: 'sample', title: 'Edit the README', labels: [] };
    const product = { slug: 'sample', name: 'Sample', dir, repoPath: dir };
    for (const engine of ['claude', 'codex']) {
      const brief = supervisor.buildBrief(item, product, { engine });
      expect(brief).toContain('Custom worker instructions.');
      expect(brief).toContain(COMMIT_IDENTITY_CHECK);
      expect(brief).toContain('one approval request');
    }
    expect(supervisor.buildBrief(item, { ...product, repoPath: null })).not.toContain(COMMIT_IDENTITY_CHECK);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

it('preflight refuses a missing identity and accepts the configured one without changing it', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-preflight-'));
  const env = { ...process.env, HOME: dir, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  for (const k of Object.keys(env)) if (/^GIT_(AUTHOR|COMMITTER|CONFIG)/.test(k) || k === 'EMAIL') delete env[k];
  Object.assign(env, { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' });
  const run = (...args) => execFileSync('git', args, { cwd: dir, env, encoding: 'utf8', stdio: 'pipe' });
  const check = () => execFileSync('/bin/sh', ['-c', COMMIT_IDENTITY_CHECK], { cwd: dir, env, encoding: 'utf8', stdio: 'pipe' });
  try {
    run('init', '-q');
    expect(check).toThrow();
    run('config', 'user.name', 'Example Developer');
    expect(check).toThrow();
    run('config', 'user.email', 'developer@example.test');
    expect(check()).toContain('Example Developer <developer@example.test>');
    expect(run('config', 'user.email').trim()).toBe('developer@example.test');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
