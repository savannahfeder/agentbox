// A COMPUTER WHERE GIT CANNOT RUN SAYS, IN ONE SENTENCE, HOW TO FIX IT.
//
// FOUND 2026-10-15 going through how people's git setups differ. Every task
// folder is made with git, and two everyday setups stop git before it does
// anything at all:
//
//   A Mac without the Command Line Tools. `/usr/bin/git` is only a stand-in
//   there, and it prints "xcrun: error: invalid active developer path
//   (/Library/Developer/CommandLineTools), missing xcrun at: ..." and exits 1.
//   That is every new Mac, and every Mac after some macOS updates.
//
//   A repository owned by another account on the same computer (copied over
//   from an old Mac, or made with sudo). git refuses it with "fatal: detected
//   dubious ownership in repository at '...'" and exits 128.
//
// MEASURED through `ensureTaskFolder` with a stand-in git first on PATH for the
// first, and the real git 2.39.5 with GIT_TEST_ASSUME_DIFFERENT_OWNER=1 (git's
// own switch for exactly this) for the second. Both answered null, which the
// supervisor turns into "This task did not start, because it could not be
// given a folder of its own to work in: no folder could be made for w-... in
// /path ... The usual causes are a full disk, a path the app cannot write
// to...". Nothing in that names git, and nothing says what to do. With the real
// git the second also ran `git init` over the other account's repository on
// the way, since "not a repository" was the only reading of a failure.
//
// So the refusal now carries the one thing to do: run `xcode-select --install`,
// install git, or trust the folder with `safe.directory`. AND WHAT MUST NOT
// CHANGE: a working git over a plain folder still makes it a repository, and a
// git that fails for any other reason is not told to install anything.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureTaskFolder } from '../main/task-folders.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** What git says when it will not read this folder, or '' when it reads it. */
function whyGitRefused(cwd) {
  try {
    execFileSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return '';
  } catch (error) {
    return String(error.stderr || error.message);
  }
}

let dir;
let stubs;
let saved;

beforeEach(() => {
  saved = {
    PATH: process.env.PATH,
    ASSUME: process.env.GIT_TEST_ASSUME_DIFFERENT_OWNER,
    GLOBAL: process.env.GIT_CONFIG_GLOBAL,
    NOSYSTEM: process.env.GIT_CONFIG_NOSYSTEM,
  };
  dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'git-cannot-run-')));
  stubs = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'git-stub-')));
});
afterEach(() => {
  process.env.PATH = saved.PATH;
  for (const [name, was] of [
    ['GIT_TEST_ASSUME_DIFFERENT_OWNER', saved.ASSUME],
    ['GIT_CONFIG_GLOBAL', saved.GLOBAL],
    ['GIT_CONFIG_NOSYSTEM', saved.NOSYSTEM],
  ]) {
    if (was === undefined) delete process.env[name];
    else process.env[name] = was;
  }
  for (const p of [dir, stubs]) fs.rmSync(p, { recursive: true, force: true });
});

/** A `git` first on PATH that says this and exits with that. */
function gitThatSays(text, status) {
  const stub = path.join(stubs, 'git');
  fs.writeFileSync(stub, `#!/bin/sh\ncat >&2 <<'SAID'\n${text}\nSAID\nexit ${status}\n`);
  fs.chmodSync(stub, 0o755);
  process.env.PATH = `${stubs}${path.delimiter}${saved.PATH}`;
}

const XCRUN = 'xcrun: error: invalid active developer path (/Library/Developer/CommandLineTools), missing xcrun at: /Library/Developer/CommandLineTools/usr/bin/xcrun';

function repository() {
  git(dir, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(dir, 'app.txt'), 'one\n');
  git(dir, 'add', '.');
  git(dir, '-c', 'user.name=T', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'first');
}

describe('a task folder on a computer where git cannot run', () => {
  it('a Mac without the Command Line Tools is told to run xcode-select --install', () => {
    repository();
    gitThatSays(XCRUN, 1);

    let said = '';
    try { ensureTaskFolder(dir, 'w-xcrun', { dependencies: false }); } catch (error) { said = error.message; }

    expect(said).toMatch(/xcode-select --install/);
    expect(said).not.toMatch(/xcrun: error/);
  });

  it('says the same over a plain folder, which is where a first project starts', () => {
    gitThatSays(XCRUN, 1);

    expect(() => ensureTaskFolder(dir, 'w-xcrun', { dependencies: false })).toThrow(/xcode-select --install/);
  });

  it('a computer with no git at all is told to install it', () => {
    process.env.PATH = stubs;

    expect(() => ensureTaskFolder(dir, 'w-none', { dependencies: false })).toThrow(/install git/i);
  });

  it('a repository owned by another account names the folder and how to trust it', () => {
    repository();
    // Without the machine's own git config out of the way, a computer that
    // trusts every folder (`safe.directory = *`) reads the repository happily
    // and the refusal this test is about never happens. The line below says so
    // in words if that ever changes again.
    process.env.GIT_CONFIG_GLOBAL = '/dev/null';
    process.env.GIT_CONFIG_NOSYSTEM = '1';
    process.env.GIT_TEST_ASSUME_DIFFERENT_OWNER = '1';
    expect(whyGitRefused(dir)).toMatch(/dubious ownership/);

    let said = '';
    try { ensureTaskFolder(dir, 'w-owner', { dependencies: false }); } catch (error) { said = error.message; }

    expect(said).toContain(`git config --global --add safe.directory '${dir}'`);
    expect(said).not.toMatch(/dubious/);
    delete process.env.GIT_TEST_ASSUME_DIFFERENT_OWNER;
    // And nothing was done to that repository on the way.
    expect(git(dir, 'rev-list', '--count', 'HEAD')).toBe('1');
    expect(fs.existsSync(path.join(dir, '.claude'))).toBe(false);
  });

  it('a stand-in git saying the same is read the same way', () => {
    gitThatSays(`fatal: detected dubious ownership in repository at '${dir}'`, 128);

    expect(() => ensureTaskFolder(dir, 'w-owner', { dependencies: false })).toThrow(/safe\.directory/);
  });

  it('a git that fails for some other reason is not told to install or trust anything', () => {
    gitThatSays('fatal: something else entirely', 128);

    let said = null;
    try { said = ensureTaskFolder(dir, 'w-other', { dependencies: false }); } catch (error) { said = error.message; }

    expect(String(said)).not.toMatch(/xcode-select|install git|safe\.directory/i);
  });

  it('a working git over a plain folder still makes it a repository', () => {
    fs.writeFileSync(path.join(dir, 'notes.md'), 'hi\n');

    expect(ensureTaskFolder(dir, 'w-fine', { dependencies: false })).toMatchObject({ taken: true });
  }, 30_000);
});
