// A PATH THE APP CANNOT LOOK AT IS NOT A PATH WITH NOTHING AT IT.
//
// FOUND 2026-10-07 reading main/worktree-include.mjs (w-5952e6de3e, with
// Codex), and carried on w-69d441d38e. Every `lstat` in that file was wrapped
// in a bare `catch` answering false, and every `readlink` in one answering "it
// went away". A permission error is neither of those things.
//
// WHERE IT BITES, measured 2026-10-07 against the previous code and reproduced
// below. `carryLocalFiles` inspects every link in what it carried, and the last
// question it asks is whether the link reaches out of the folder THROUGH
// another link, which it answers by resolving the nearest ancestor that is
// really on disk. A directory the app may not look inside — one macOS protects,
// one another user owns — made every ancestor read as absent, the check was
// skipped for want of an answer, and the link was carried in as fine. On the
// old code that link lands in the task folder; on this one the folder is
// refused and the path is named.
//
// A check skipped because the answer could not be read is a check that did not
// happen, and this one is what keeps a new folder from being built through a
// link leading into another task's work.
//
// SO ENOENT AND ENOTDIR STAY ABSENCES: the name is not there, or a name on the
// way to it is a file, and nothing can be at it either way. A repository naming
// a file nobody has made yet is ordinary and must stay silent. Anything else is
// this folder failing to be made, which main/supervisor.mjs says on the row.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { carryLocalFiles } from '../main/worktree-include.mjs';
import { ensureTaskFolder } from '../main/task-folders.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** A repository that asks for one local directory, the way these products do. */
function repo() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cannot-look-')));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  fs.writeFileSync(path.join(dir, 'app.txt'), 'one\n');
  fs.writeFileSync(path.join(dir, '.gitignore'), 'deps/\n');
  fs.writeFileSync(path.join(dir, '.worktreeinclude'), 'deps\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'first');
  return dir;
}

const SHUT = 'shut';

describe('carrying local files past something it cannot look at', () => {
  let dir;
  let folder;
  beforeEach(() => { dir = repo(); folder = null; });
  afterEach(() => {
    if (folder) try { fs.chmodSync(path.join(folder, SHUT), 0o755); } catch {}
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  });

  // THE ONE THAT WAS WAVED THROUGH. The link's way out runs through a directory
  // this process may not look inside, so whether it leads out cannot be
  // answered, and an unanswered question is not a yes.
  it('refuses a link whose way out cannot be inspected, and names the path', () => {
    fs.mkdirSync(path.join(dir, 'deps'), { recursive: true });
    fs.symlinkSync(`../${SHUT}/thing`, path.join(dir, 'deps', 'out'));
    // A folder off the same repository, so it ignores `deps` exactly as the
    // real staging folder does, with one directory in it that is shut.
    folder = path.join(dir, 'destination');
    git(dir, 'worktree', 'add', '-q', folder, '-b', 'agentbox/w-dest', 'refs/heads/main');
    fs.mkdirSync(path.join(folder, SHUT));
    fs.chmodSync(path.join(folder, SHUT), 0o000);

    // Asked ONCE, because the copy happens before the inspection: a second ask
    // finds `deps` already there, carries nothing, and inspects nothing.
    let why = null;
    try { carryLocalFiles(dir, folder); } catch (error) { why = error.message; }
    expect(why).toMatch(/could not be looked at/);
    expect(why).toContain(SHUT);
  });

  // THE CASE THAT MUST NOT MATCH, and the reason the bare catch was written: a
  // repository naming something nobody has made yet is ordinary, and asking for
  // a folder may not fail over it.
  it('says nothing about a named path that is genuinely not there', () => {
    const made = ensureTaskFolder(dir, 'w-nothing-named');
    expect(made.taken).toBe(true);
    expect(fs.existsSync(path.join(made.path, 'deps'))).toBe(false);
    expect(fs.existsSync(path.join(made.path, 'app.txt'))).toBe(true);
  });

  // A NAME ON THE WAY TO IT THAT IS A FILE is an absence too: nothing can be
  // under `deps/local.json` while `deps` is a file. That is the ENOTDIR half,
  // and it is here so that staying silent about it is a decision.
  it('says nothing when the path runs through a file', () => {
    fs.writeFileSync(path.join(dir, '.worktreeinclude'), 'deps/local.json\n');
    fs.writeFileSync(path.join(dir, 'deps'), 'not a directory at all\n');

    const made = ensureTaskFolder(dir, 'w-through-a-file');
    expect(made.taken).toBe(true);
    expect(fs.existsSync(path.join(made.path, 'app.txt'))).toBe(true);
  });

  // And the boundary the other side of all of it: what it can read, it carries.
  it('still carries what it can read', () => {
    fs.mkdirSync(path.join(dir, 'deps'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'deps', 'local.json'), '{"real":true}\n');

    const made = ensureTaskFolder(dir, 'w-readable');
    expect(fs.readFileSync(path.join(made.path, 'deps', 'local.json'), 'utf8')).toBe('{"real":true}\n');
  });
});
