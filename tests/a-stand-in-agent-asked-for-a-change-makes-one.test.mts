// Three power testers (2026-11-09) logged "cannot find how to bring cloud
// changes back". The stand-in agents had never changed a file: they read
// src/part-N.js and answered, so a cloud run had nothing to bring home and the
// launch's "files come back" could not be tested at all. A stand-in asked for a
// code change now commits one small file in its folder when the power test's
// world says so.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { standInEdit, asksForAChange } from '../scripts/lib/stand-in-world.mjs';
import { chaosPlan, worldAt } from '../.claude/skills/power-test/scripts/plan.mjs';

const dirs: string[] = [];
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true }); });
const repo = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stand-in-edit-'));
  dirs.push(dir);
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '--allow-empty', '-m', 'start'], { cwd: dir });
  return dir;
};
const git = (dir: string, ...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();

describe('a stand-in asked for a change', () => {
  it('commits one file named after the task, and says which', () => {
    const dir = repo();
    const file = standInEdit(dir, 'Fix the settings page flashing white');
    expect(file).toBe('stand-in-changes/fix-the-settings-page-flashing-white.md');
    expect(fs.readFileSync(path.join(dir, file!), 'utf8')).toContain('Fix the settings page flashing white');
    expect(git(dir, 'status', '--porcelain')).toBe('');
    expect(git(dir, 'log', '--oneline').split('\n')).toHaveLength(2);
  });

  it('changes nothing outside a git folder', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stand-in-plain-'));
    dirs.push(dir);
    expect(standInEdit(dir, 'Fix it')).toBe(null);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('is asked by code work, not by research or a question', () => {
    for (const t of ['fix the white flash', 'Add structured logging to the backend', 'write table tests for the user service', 'rename the env var']) expect(asksForAChange(t)).toBe(true);
    for (const t of ['find the slowest endpoint and say why', 'research three competitors', 'what does this do?']) expect(asksForAChange(t)).toBe(false);
  });
});

describe("the power test's world", () => {
  it('turns stand-in changes on for stand-ins, and leaves real agents alone', () => {
    const hour = 3_600_000;
    expect(worldAt(chaosPlan('normal', hour), 1000).edits).toBe(true);
    expect(worldAt(chaosPlan('normal', hour, { real: true }), 1000).edits).toBeUndefined();
  });
});
