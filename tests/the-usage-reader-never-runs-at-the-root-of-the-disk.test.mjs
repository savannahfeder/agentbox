// THE TWO PERMISSION PANELS ON A FRESH DOWNLOAD.
//
// What happened, measured on her Mac. An app opened from Finder has `/` as its
// working directory. The usage reader spawned `claude -p /usage` without naming
// one, so Claude Code started in `/`, indexed the disk, and macOS asked her,
// under Agentbox's name, for files on a network volume (18:07:41) and for her
// Apple Music library (18:07:45), ten seconds after a transcript with
// `cwd: "/"` began (18:07:31). Nothing in Agentbox needs either.
//
// The rule these pin: every Claude Code the app starts on its own behalf runs
// in a folder it names, and that folder is not the disk, not her home and not
// anything macOS guards.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClaudeUsage, usageCwd } from '../main/claude-usage.mjs';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf8');

describe('the usage reading', () => {
  it('runs Claude Code in a folder of its own, never wherever the app was opened from', () => {
    const calls = [];
    const usage = new ClaudeUsage({
      bin: () => '/somewhere/claude',
      run: (bin, args, opts, cb) => { calls.push({ bin, args, opts }); cb(null, ''); },
      now: () => 1_000,
    });
    usage.read();
    expect(calls).toHaveLength(1);
    const { cwd } = calls[0].opts;
    expect(typeof cwd).toBe('string');
    expect(path.isAbsolute(cwd)).toBe(true);
    expect(cwd).not.toBe('/');
    expect(cwd).not.toBe(process.cwd());
    expect(fs.statSync(cwd).isDirectory()).toBe(true);
  });

  it('keeps that folder under the temp directory, which macOS guards with no panel', () => {
    const dir = usageCwd();
    expect(dir.startsWith(os.tmpdir())).toBe(true);
    expect(dir.startsWith(os.homedir() + path.sep)).toBe(false);
    // And it is ours alone, so nothing of anybody's is ever indexed from it.
    expect(path.basename(dir)).toBe('agentbox-usage');
  });

  it('is told where to run by the caller in a test, so this can be pinned without touching the disk', () => {
    const calls = [];
    const usage = new ClaudeUsage({
      bin: () => '/somewhere/claude',
      run: (_b, _a, opts, cb) => { calls.push(opts.cwd); cb(null, ''); },
      now: () => 1_000,
      where: () => '/a/folder/named/by/the/test',
    });
    usage.read();
    expect(calls).toEqual(['/a/folder/named/by/the/test']);
  });
});

describe('every Claude Code the app starts for itself names its working directory', () => {
  it('the usage reader', () => {
    expect(read('main/claude-usage.mjs')).toMatch(/cwd:\s*this\._where\(\)/);
  });

  it('the agent list', () => {
    expect(read('main/agents.mjs')).toMatch(/cwd:\s*os\.tmpdir\(\)/);
  });

  it('and a worker, which runs in its own project', () => {
    const src = read('main/supervisor.mjs');
    const at = src.indexOf('spawn(this.config.claudeBin');
    expect(at).toBeGreaterThan(-1);
    expect(src.slice(at, at + 200)).toMatch(/\bcwd\b/);
  });
});
