// A CLOUD RUN TAKES THE PROJECT'S SAVED MEMORIES WITH IT.
//
// What broke (2026-10-16): every resumed cloud turn's transcript recorded the
// saved memories (`.../projects/<main checkout>/memory/MEMORY.md`) as removed.
// Claude Code keeps a project's memories under the MAIN checkout's folder
// name, and a task folder is a linked worktree of it on the Mac; in the cloud
// that folder is a repository of its own, so Claude Code looked under the
// task folder's name and found nothing. Measured off 25 resumed cloud starts.
//
// Now the run finds the main checkout's memories and sends them to where
// Claude Code in the cloud looks.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { memoryFolderFor, transcriptFolderName } from '../main/cloud/run.mjs';

const dirs = [];
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true }); });
const git = (cwd, ...a) => execFileSync('git', a, { cwd, stdio: 'pipe' });

const world = () => {
  const top = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-memory-')));
  dirs.push(top);
  const repo = path.join(top, 'app');
  fs.mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'main', '.');
  git(repo, 'config', 'user.email', 't@example.com'); git(repo, 'config', 'user.name', 't');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'a\n');
  git(repo, 'add', '.'); git(repo, 'commit', '-qm', 'a');
  const task = path.join(repo, '.claude', 'worktrees', 'w-1');
  git(repo, 'worktree', 'add', '-q', '-b', 'agentbox/w-1', task);
  const config = path.join(top, '.claude-2');
  return { repo, task, config };
};

describe('the saved memories of a task folder\'s project', () => {
  it('are found under the main checkout\'s name', () => {
    const { repo, task, config } = world();
    const mem = path.join(config, 'projects', transcriptFolderName(repo), 'memory');
    fs.mkdirSync(mem, { recursive: true });
    fs.writeFileSync(path.join(mem, 'MEMORY.md'), '- a note\n');
    expect(memoryFolderFor(task, config)).toBe(mem);
  });

  it('are not looked for from the main checkout itself, or when there are none', () => {
    const { repo, task, config } = world();
    expect(memoryFolderFor(task, config)).toBeNull();
    const mem = path.join(config, 'projects', transcriptFolderName(repo), 'memory');
    fs.mkdirSync(mem, { recursive: true });
    expect(memoryFolderFor(task, config)).toBeNull();
    fs.writeFileSync(path.join(mem, 'MEMORY.md'), '- a note\n');
    expect(memoryFolderFor(repo, config)).toBeNull();
  });

  it('are not found for a folder that is not a repository', () => {
    const top = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-memory-none-'));
    dirs.push(top);
    expect(memoryFolderFor(top, path.join(top, '.claude'))).toBeNull();
  });
});
