// A REPOSITORY THAT SIGNS ITS COMMITS STILL HAS ITS TASK FOLDERS PUT AWAY.
//
// FOUND 2026-10-15 going through how people's git setups differ. Plenty of
// people sign every commit (`commit.gpgsign=true`), through gpg with a pinentry
// window or through an SSH key held by 1Password, and either one can stop and
// wait for a person. The app's own first commit already turned signing off for
// that reason. The two commits `parkTaskFolder` makes did not.
//
// MEASURED with the real git 2.39.5 and a `gpg.program` that sleeps for 600
// seconds, standing in for a signer waiting on a passphrase nobody will type:
// `parkTaskFolder` never returned, killed at 25 seconds with the stub still
// running as `gpg-stub.sh --status-fd=2 -bsau`. The same with `gpg.format=ssh`
// and `gpg.ssh.program` (`ssh-stub.sh -Y sign -n git`). Folder jobs run one at a
// time on one thread (main/task-folders-offthread.mjs), so one park stuck on a
// signer is every later task in every project left without a folder until the
// app restarts. A signer that refuses outright (a locked 1Password) is the
// milder half: the park came back `refused` and the folder was never reclaimed.
//
// The stub here records that it was called and refuses at once, which is the
// same question asked without waiting ten minutes for the answer.
//
// AND WHAT MUST NOT CHANGE: the person's own setting. Their commits in their
// own checkout still sign; only the app's bookkeeping commits do not.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ensureTaskFolder, parkTaskFolder, restoreTaskFolder, PARKED,
} from '../main/task-folders.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

let dir;
let tools;
let calls;

/** A signer that writes down that it was asked, and refuses. */
function signer(name) {
  const stub = path.join(tools, `${name}.sh`);
  fs.writeFileSync(stub, `#!/bin/sh\necho called >> "${calls}"\nexit 1\n`);
  fs.chmodSync(stub, 0o755);
  return stub;
}

beforeEach(() => {
  dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'signed-repo-')));
  tools = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'signer-')));
  calls = path.join(tools, 'calls');
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  fs.writeFileSync(path.join(dir, 'app.txt'), 'one\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'first');
});

afterEach(() => {
  for (const p of [dir, tools]) fs.rmSync(p, { recursive: true, force: true });
});

const signerWasCalled = () => fs.existsSync(calls);

describe('parking a task folder in a repository that signs its commits', () => {
  it('parks without asking a gpg signer, and the work comes back', () => {
    git(dir, 'config', 'commit.gpgsign', 'true');
    git(dir, 'config', 'gpg.program', signer('gpg'));
    const made = ensureTaskFolder(dir, 'w-gpg', { dependencies: false });
    fs.writeFileSync(path.join(made.path, 'work.txt'), 'half done\n');

    const parked = parkTaskFolder(dir, 'w-gpg');

    expect(parked).toMatchObject({ parked: true, kept: 'work in progress' });
    expect(signerWasCalled()).toBe(false);
    expect(fs.existsSync(made.path)).toBe(false);
    expect(git(dir, 'log', '-1', '--format=%s', 'agentbox/w-gpg')).toBe(PARKED);

    const back = restoreTaskFolder(dir, 'w-gpg');
    expect(fs.readFileSync(path.join(back.path, 'work.txt'), 'utf8')).toBe('half done\n');
  }, 30_000);

  it('parks without asking an SSH signer either', () => {
    git(dir, 'config', 'commit.gpgsign', 'true');
    git(dir, 'config', 'gpg.format', 'ssh');
    git(dir, 'config', 'gpg.ssh.program', signer('ssh'));
    git(dir, 'config', 'user.signingkey', 'ssh-ed25519 AAAAnot-a-real-key');
    const made = ensureTaskFolder(dir, 'w-ssh', { dependencies: false });
    fs.writeFileSync(path.join(made.path, 'work.txt'), 'half done\n');

    expect(parkTaskFolder(dir, 'w-ssh')).toMatchObject({ parked: true });
    expect(signerWasCalled()).toBe(false);
  }, 30_000);

  it('a folder with nothing uncommitted makes no commit, so there is nothing to sign', () => {
    git(dir, 'config', 'commit.gpgsign', 'true');
    git(dir, 'config', 'gpg.program', signer('gpg'));
    ensureTaskFolder(dir, 'w-clean', { dependencies: false });

    expect(parkTaskFolder(dir, 'w-clean')).toMatchObject({ parked: true, kept: 'nothing uncommitted' });
    expect(signerWasCalled()).toBe(false);
  }, 30_000);

  it("leaves the person's own signing alone: their commits still go to the signer", () => {
    git(dir, 'config', 'commit.gpgsign', 'true');
    git(dir, 'config', 'gpg.program', signer('gpg'));
    const made = ensureTaskFolder(dir, 'w-theirs', { dependencies: false });
    fs.writeFileSync(path.join(made.path, 'work.txt'), 'half done\n');
    parkTaskFolder(dir, 'w-theirs');

    expect(git(dir, 'config', 'commit.gpgsign')).toBe('true');
    fs.writeFileSync(path.join(dir, 'app.txt'), 'two\n');
    expect(() => git(dir, 'commit', '-q', '-am', 'mine')).toThrow();
    expect(signerWasCalled()).toBe(true);
  }, 30_000);
});
