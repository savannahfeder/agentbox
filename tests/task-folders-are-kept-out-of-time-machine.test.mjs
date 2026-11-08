// TASK FOLDERS ARE KEPT OUT OF TIME MACHINE.
//
// What broke (w-8918e86ce0, 2026-11-07): every task folder carries a copy of
// its project's packages. On the owner's Mac 52 task folders held 1.9 million
// files, 70% of everything the backup tracked; the backup spent up to 4.8 GB
// of memory and 94% of its uploads on them, and rescanned them every hour.
// A person's own backup is theirs to set, but the app knows these folders are
// copies: the work in them is committed to the project's repository, which is
// backed up. So the folder that holds them is marked for Time Machine to skip,
// with macOS's own `tmutil addexclusion`, once per project per run.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { keepOutOfBackups } from '../main/task-folders.mts';

describe('marking the folder', () => {
  it('asks tmutil once for a folder on a Mac, not on every task', () => {
    const run = vi.fn();
    const dir = `/repo-${Math.random()}/.claude/worktrees`;
    expect(keepOutOfBackups(dir, { platform: 'darwin', run })).toBe(true);
    expect(keepOutOfBackups(dir, { platform: 'darwin', run })).toBe(false);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith('/usr/bin/tmutil', ['addexclusion', dir]);
  });

  it('leaves a folder in the temporary folder alone, which Time Machine never backs up', () => {
    const run = vi.fn();
    expect(keepOutOfBackups(path.join(os.tmpdir(), `repo-${Math.random()}`, '.claude', 'worktrees'), { platform: 'darwin', run })).toBe(false);
    // Spelled through the link a Mac's /var is, as a folder that exists is.
    const made = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-'));
    expect(keepOutOfBackups(fs.realpathSync(made), { platform: 'darwin', run })).toBe(false);
    expect(keepOutOfBackups(path.join(made, 'not-made-yet'), { platform: 'darwin', run })).toBe(false);
    fs.rmSync(made, { recursive: true, force: true });
    expect(run).not.toHaveBeenCalled();
  });

  it('does nothing off a Mac', () => {
    const run = vi.fn();
    expect(keepOutOfBackups(`/repo-${Math.random()}/.claude/worktrees`, { platform: 'linux', run })).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it('a tmutil that fails or is missing never stops a task folder being made', () => {
    const run = vi.fn(() => { throw new Error('tmutil: not found'); });
    expect(keepOutOfBackups(`/repo-${Math.random()}/.claude/worktrees`, { platform: 'darwin', run })).toBe(false);
  });
});

it('is done where a task folder\'s home is made, before the folder is built', () => {
  const source = fs.readFileSync(path.join(import.meta.dirname, '../main/task-folders.mts'), 'utf8');
  const made = source.indexOf('fs.mkdirSync(path.dirname(folder), { recursive: true });');
  const marked = source.indexOf('keepOutOfBackups(path.dirname(folder))');
  expect(made).toBeGreaterThan(-1);
  expect(marked).toBeGreaterThan(made);
  expect(marked).toBeLessThan(source.indexOf('const staging = buildingFolderPath(root, name);'));
});
