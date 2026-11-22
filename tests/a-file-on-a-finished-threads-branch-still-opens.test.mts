// A cloud thread answered "the validator is committed on this task's branch" and
// linked tools/validate_results.py; the panel said "tools/validate_results.py is
// not in Eval harness. Nothing was opened." (two overnight testers, 2026-11-16).
// The work had come home as the branch agentbox/<thread> and its folder had been
// given back, so the file was in git and on no disk the panel looks at.
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveArtifact } from '../main/artifact-path.mts';
import { taskBranch } from '../main/task-folders.mts';

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' });
let root = '', repo = '', dir = '';
const thread = 'w-88fab781ae';

beforeAll(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'branch-file-')));
  repo = path.join(root, 'eval-harness');
  dir = path.join(root, 'docs');
  fs.mkdirSync(repo); fs.mkdirSync(dir);
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.email', 'a@b.c'); git(repo, 'config', 'user.name', 'A');
  fs.writeFileSync(path.join(repo, 'README.md'), 'eval\n');
  git(repo, 'add', '.'); git(repo, 'commit', '-qm', 'seed');
  git(repo, 'checkout', '-qb', taskBranch(thread));
  fs.mkdirSync(path.join(repo, 'tools'));
  fs.writeFileSync(path.join(repo, 'tools', 'validate_results.py'), 'print("ok")\n');
  git(repo, 'add', '.'); git(repo, 'commit', '-qm', 'validator');
  git(repo, 'checkout', '-q', 'main');
});

const open = (src: string, from: string | null = thread) => resolveArtifact({
  src, product: 'eval', products: [{ slug: 'eval', dir, name: 'Eval harness', repoPath: repo }] as never,
  accountRoot: root, storeRoot: root, thread: from,
});

describe('a file committed on a finished thread\'s branch', () => {
  it('opens from that thread, showing what the branch holds', async () => {
    const out = await open('tools/validate_results.py');
    expect(out.ok).toBe(true);
    expect(fs.readFileSync(out.path!, 'utf8')).toBe('print("ok")\n');
  });

  it('does not open from another thread', async () => {
    expect((await open('tools/validate_results.py', 'w-0000000001')).ok).toBe(false);
  });

  it('does not open a path that climbs out of the project', async () => {
    expect((await open('../eval-harness/tools/validate_results.py')).ok).toBe(false);
  });

  it('a name the branch does not hold is still not found', async () => {
    expect((await open('tools/missing.py')).ok).toBe(false);
  });
});
