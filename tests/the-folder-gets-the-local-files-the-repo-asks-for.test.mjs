// A NEW FOLDER CARRIES THE LOCAL FILES THE REPOSITORY ASKS FOR BY NAME.
//
// WHY THIS EXISTS. On 2026-10-07 (w-5952e6de3e) people on X said agent
// worktrees are brittle, and named untracked files as the reason:
// "index locks and untracked files make them brittle". Measured on one Mac the
// same day, across the seven task folders that were live: all seven had
// node_modules, and not one had `zero.config.json`, the app's own configuration.
// Five of seven lacked it; the other two had taken the other path. So the app
// ran in those folders with `loadConfig()` falling back to defaults, which is a
// different app from the one in the checkout beside it.
//
// The cause was that exactly ONE ignored path was ever carried: `node_modules`,
// hardcoded. Everything else a repository needs and git does not track -- a
// `.env`, a key, a config -- was simply absent, and nothing said so.
//
// THE MECHANISM IS NOT OURS AND THAT IS THE POINT. `.worktreeinclude` is a file
// at the repository root, in .gitignore pattern syntax, naming the IGNORED files
// to carry into a new worktree. Conductor reads it and so does Claude Code, for
// exactly this purpose. A repository already set up for either of them works
// here with no second file to write.
//
// THE CONTRACT, and every line of it is tested below:
//   - No `.worktreeinclude` means `/node_modules/`, which is what was carried
//     before, so no repository is worse off for not having heard of this.
//   - A file that exists and selects nothing carries NOTHING. Present and empty
//     is a decision, not an absence, so it does not quietly fall back.
//   - Only what git ALREADY IGNORES is eligible. A pattern naming tracked
//     content selects nothing, so this can never shadow the commit.
//   - `.git` and the folder other tasks live in are excluded whatever the
//     patterns say. `**` matches `.claude/` otherwise, and that directory holds
//     every other task's folder.
//   - BOTH ways of making a folder produce the same thing. That assertion is the
//     reason this file is worth having: the two paths used to differ, the fast
//     one carrying every untracked file in the checkout and the ordinary one
//     carrying one.
//   - A dependency link pointing OUT of the folder is refused by name. Measured
//     on this Mac: one hand-made worktree had `node_modules` symlinked back to
//     the shared checkout, so an `npm install` in it rewrote every other
//     folder's dependencies. Carrying that link forward would recreate it.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureTaskFolder, taskFolderPath } from '../main/task-folders.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');
const write = (file, body) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
};

/**
 * A repository shaped like one of the products: tracked source, a .gitignore,
 * and the local files a person's machine holds that git never sees.
 */
function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carry-local-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  write(path.join(dir, 'app.txt'), 'one\n');
  write(path.join(dir, 'renderer', 'index.ts'), 'export const a = 1;\n');
  write(path.join(dir, '.gitignore'), 'node_modules/\nzero.config.json\n.env\nrenderer/dist/\nsecrets/\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'first');
  // What the machine holds and git does not.
  write(path.join(dir, 'node_modules', 'left-pad', 'index.js'), 'module.exports = 1;\n');
  write(path.join(dir, 'zero.config.json'), '{"storeRoot":"/somewhere"}\n');
  write(path.join(dir, '.env'), 'TOKEN=shhh\n');
  write(path.join(dir, 'renderer', 'dist', 'bundle.js'), 'built\n');
  write(path.join(dir, 'secrets', 'key.pem'), 'pretend\n');
  return dir;
}

/** Makes the checkout dirty, which is the only thing that picks the other path. */
const theOtherWay = (dir) => write(path.join(dir, 'app.txt'), 'somebody is mid-edit\n');

describe('the local files a new folder is given', () => {
  let dir;
  beforeEach(() => { dir = repo(); });
  afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

  // WHAT A REPOSITORY THAT HAS NEVER HEARD OF THIS GETS: exactly what it got
  // before, which is its dependencies and nothing else.
  it('is node_modules and nothing else when the repository does not ask', () => {
    const made = ensureTaskFolder(dir, 'w-nofile');
    expect(fs.existsSync(path.join(made.path, 'node_modules', 'left-pad', 'index.js'))).toBe(true);
    expect(fs.existsSync(path.join(made.path, 'zero.config.json'))).toBe(false);
    expect(fs.existsSync(path.join(made.path, '.env'))).toBe(false);
  });

  it('is what .worktreeinclude names, carried in', () => {
    write(path.join(dir, '.worktreeinclude'), '# what this machine holds\n/node_modules/\nzero.config.json\n.env\n');
    git(dir, 'add', '.worktreeinclude');
    git(dir, 'commit', '-q', '-m', 'say what a folder needs');

    const made = ensureTaskFolder(dir, 'w-asked');

    expect(read(made.path, 'zero.config.json')).toBe('{"storeRoot":"/somewhere"}\n');
    expect(read(made.path, '.env')).toBe('TOKEN=shhh\n');
    expect(fs.existsSync(path.join(made.path, 'node_modules', 'left-pad', 'index.js'))).toBe(true);
    // Not asked for, so not there. The list is the whole list.
    expect(fs.existsSync(path.join(made.path, 'secrets', 'key.pem'))).toBe(false);
  });

  // THE SAME FOLDER, HOWEVER IT WAS MADE. This is the assertion the file is for.
  it('is the same whichever way the folder was made', () => {
    write(path.join(dir, '.worktreeinclude'), '/node_modules/\nzero.config.json\n');
    git(dir, 'add', '.worktreeinclude');
    git(dir, 'commit', '-q', '-m', 'say what a folder needs');

    const fast = ensureTaskFolder(dir, 'w-fast');
    expect(fast.how).toBe('clone');
    theOtherWay(dir);
    const slow = ensureTaskFolder(dir, 'w-slow');
    expect(slow.how).toBe('checkout');

    const seen = (folder) => [
      fs.existsSync(path.join(folder, 'zero.config.json')),
      fs.existsSync(path.join(folder, 'node_modules', 'left-pad', 'index.js')),
      fs.existsSync(path.join(folder, '.env')),
      fs.existsSync(path.join(folder, 'renderer', 'dist', 'bundle.js')),
      fs.existsSync(path.join(folder, 'secrets', 'key.pem')),
    ];
    expect(seen(fast.path)).toEqual(seen(slow.path));
    // And specifically: the two asked-for things, and none of the three others.
    expect(seen(fast.path)).toEqual([true, true, false, false, false]);
  });

  // PRESENT AND EMPTY IS A DECISION. Falling back to the default here would
  // mean there is no way to say "carry nothing".
  it('is nothing at all when the repository asks for nothing', () => {
    write(path.join(dir, '.worktreeinclude'), '# we want a bare folder\n\n');
    git(dir, 'add', '.worktreeinclude');
    git(dir, 'commit', '-q', '-m', 'bare');

    const made = ensureTaskFolder(dir, 'w-empty');

    expect(fs.existsSync(path.join(made.path, 'node_modules'))).toBe(false);
    expect(fs.existsSync(path.join(made.path, 'zero.config.json'))).toBe(false);
    // The commit is still all there. This is about local files only.
    expect(read(made.path, 'app.txt')).toBe('one\n');
    expect(git(made.path, 'status', '--porcelain', '--untracked-files=no')).toBe('');
  });

  // THE CASE THAT MUST NOT MATCH, AND THE DANGEROUS ONE. Only what git already
  // ignores is eligible, so a pattern naming tracked content selects nothing and
  // the commit can never be shadowed by somebody's local copy.
  it('never carries a file the commit tracks', () => {
    write(path.join(dir, '.worktreeinclude'), 'app.txt\nrenderer/index.ts\n');
    git(dir, 'add', '.worktreeinclude');
    git(dir, 'commit', '-q', '-m', 'ask for tracked things');
    // Even with a different local version sitting right there.
    write(path.join(dir, 'app.txt'), 'the local edit\n');

    const made = ensureTaskFolder(dir, 'w-tracked');

    expect(read(made.path, 'app.txt')).toBe('one\n');
    expect(git(made.path, 'status', '--porcelain')).toBe('');
  });

  // AND THE ONE THAT WOULD BE A DISASTER. `.claude/worktrees` is where every
  // other task's folder lives, and it is ignored, so `**` selects it.
  it('never carries the folder the other tasks live in', () => {
    const neighbour = ensureTaskFolder(dir, 'w-neighbour');
    expect(fs.existsSync(neighbour.path)).toBe(true);
    write(path.join(dir, '.worktreeinclude'), '**\n');
    git(dir, 'add', '.worktreeinclude');
    git(dir, 'commit', '-q', '-m', 'ask for everything');

    const made = ensureTaskFolder(dir, 'w-greedy');

    expect(fs.existsSync(path.join(made.path, '.claude', 'worktrees'))).toBe(false);
    expect(fs.existsSync(path.join(made.path, '.git', 'config'))).toBe(false);
    // It did carry the ordinary local files, so the pattern was honoured.
    expect(fs.existsSync(path.join(made.path, 'zero.config.json'))).toBe(true);
  });

  it('is silent about a pattern that matches nothing', () => {
    write(path.join(dir, '.worktreeinclude'), 'nothing/like/this\n/node_modules/\n');
    git(dir, 'add', '.worktreeinclude');
    git(dir, 'commit', '-q', '-m', 'ask for a missing thing');

    const made = ensureTaskFolder(dir, 'w-missing');

    expect(fs.existsSync(path.join(made.path, 'node_modules'))).toBe(true);
  });

  // Git's own negation, not an imitation of it, which is the point of letting
  // git do the matching. Including the rule people trip over: a pattern can only
  // be taken back while its PARENT is still included, so the two patterns here
  // are `secrets/*` and not `secrets/`.
  it('honours a pattern taken back by a later one', () => {
    write(path.join(dir, 'secrets', 'other.pem'), 'also pretend\n');
    write(path.join(dir, '.worktreeinclude'), 'secrets/*\n!secrets/other.pem\nzero.config.json\n');
    git(dir, 'add', '.worktreeinclude');
    git(dir, 'commit', '-q', '-m', 'all the secrets but one');

    const made = ensureTaskFolder(dir, 'w-negated');

    expect(fs.existsSync(path.join(made.path, 'secrets', 'key.pem'))).toBe(true);
    expect(fs.existsSync(path.join(made.path, 'secrets', 'other.pem'))).toBe(false);
    expect(fs.existsSync(path.join(made.path, 'zero.config.json'))).toBe(true);
  });
});

describe('a dependency folder that is really a link somewhere else', () => {
  let dir;
  beforeEach(() => { dir = repo(); });
  afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

  // MEASURED ON THIS MAC, 2026-10-07: a hand-made worktree beside the checkout
  // had `node_modules -> ../agentbox-team/node_modules`. Every install in it
  // rewrote the dependencies of every other folder sharing that target.
  //
  // REFUSING THE FOLDER IS THE REPORT. A first version made the folder anyway
  // and returned a list of what it had refused, and nothing read that list: a
  // folder starting with no dependencies and nobody told is the fault this file
  // exists to end. The throw reaches the row, with the path and the reason.
  it('is refused, and the folder is not made behind anybody´s back', () => {
    const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-deps-'));
    write(path.join(elsewhere, 'left-pad', 'index.js'), 'shared\n');
    fs.rmSync(path.join(dir, 'node_modules'), { recursive: true, force: true });
    fs.symlinkSync(elsewhere, path.join(dir, 'node_modules'));

    expect(() => ensureTaskFolder(dir, 'w-linked')).toThrow(/node_modules/);
    expect(fs.existsSync(taskFolderPath(dir, 'w-linked'))).toBe(false);
    try { fs.rmSync(elsewhere, { recursive: true, force: true }); } catch {}
  });

  // A LINK DEEP IN A SCOPE DIRECTORY IS THE ORDINARY LAYOUT, not an exotic one,
  // and checking only a directory's immediate children misses every one of them:
  // `@scope` is a directory, so the loop steps straight over it. The whole
  // subtree is walked, and `find` does not follow links while walking, so a link
  // cannot be used to escape the walk either.
  it('is refused when the link is buried in a scope directory', () => {
    const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-pkg-'));
    write(path.join(elsewhere, 'index.js'), 'shared\n');
    fs.mkdirSync(path.join(dir, 'node_modules', '@scope'), { recursive: true });
    fs.symlinkSync(elsewhere, path.join(dir, 'node_modules', '@scope', 'thing'));

    expect(() => ensureTaskFolder(dir, 'w-scoped')).toThrow(/@scope\/thing/);
    expect(fs.existsSync(taskFolderPath(dir, 'w-scoped'))).toBe(false);
    try { fs.rmSync(elsewhere, { recursive: true, force: true }); } catch {}
  });

  // AND THE CASE THAT MUST NOT BE REFUSED: a workspace link, which npm writes
  // as a RELATIVE link inside the repository. After the folder is moved into
  // place that link points at the folder's own copy, which is right.
  it('carries a relative link that stays inside the repository', () => {
    write(path.join(dir, 'packages', 'thing', 'index.js'), 'local package\n');
    git(dir, 'add', 'packages');
    git(dir, 'commit', '-q', '-m', 'a workspace package');
    // The shape npm actually writes for a workspace: relative, one level up out
    // of node_modules, landing back inside the repository.
    fs.symlinkSync(path.join('..', 'packages', 'thing'), path.join(dir, 'node_modules', 'thing'));

    const made = ensureTaskFolder(dir, 'w-workspace');

    const link = path.join(made.path, 'node_modules', 'thing');
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(read(link, 'index.js')).toBe('local package\n');
  });

  // THE ORDER THE COPIES HAPPEN IN MUST NOT DECIDE THE ANSWER, and for one
  // commit it did. With both `node_modules` and `deps` asked for and
  // `node_modules/thing -> ../deps/thing`, git lists `node_modules` first, so
  // the link was judged against a folder that did not have `deps` in it yet,
  // called dangling, and refused -- and nothing cleared that when `deps` arrived
  // a moment later. No task in a repository like this could have started.
  it('is carried when its target is another entry copied after it', () => {
    // `vendor` sorts AFTER `node_modules`, which is the whole point: git lists
    // the entries in order, so the link is seen before its target arrives.
    write(path.join(dir, 'vendor', 'thing', 'index.js'), 'a local dependency\n');
    write(path.join(dir, '.gitignore'), 'node_modules/\nvendor/\nzero.config.json\n');
    write(path.join(dir, '.worktreeinclude'), '/node_modules\n/vendor\n');
    git(dir, 'add', '.gitignore', '.worktreeinclude');
    git(dir, 'commit', '-q', '-m', 'two entries, one pointing at the other');
    fs.symlinkSync(path.join('..', 'vendor', 'thing'), path.join(dir, 'node_modules', 'thing'));

    const made = ensureTaskFolder(dir, 'w-ordered');

    expect(read(made.path, 'node_modules', 'thing', 'index.js')).toBe('a local dependency\n');
  });

  // A LINK THAT POINTS OUT OF THE FOLDER IS A WAY OUT OF IT WHETHER OR NOT
  // ANYTHING IS THERE YET. This one aims at the folder the NEXT task works in,
  // and the first thing written through it would land in that task's work.
  // Checking containment only when the target existed let it straight through.
  it('is refused when it dangles out of the folder towards another task', () => {
    const neighbour = ensureTaskFolder(dir, 'w-neighbour');
    expect(fs.existsSync(neighbour.path)).toBe(true);
    fs.mkdirSync(path.join(dir, 'node_modules', 'pkg'), { recursive: true });
    fs.symlinkSync(path.join('..', '..', '..', 'w-neighbour', 'stolen.txt'),
      path.join(dir, 'node_modules', 'pkg', 'out'));

    expect(() => ensureTaskFolder(dir, 'w-escaper')).toThrow(/pkg\/out/);
    expect(fs.existsSync(taskFolderPath(dir, 'w-escaper'))).toBe(false);
  });

  // THE LAST NAME BEING ABSENT SAYS NOTHING ABOUT THE ONES BEFORE IT. The commit
  // itself tracks a link out of the repository, and a carried link aims through
  // it at a name that is not there. Every component of that path is inside the
  // folder to read, and the first write through it lands in the shared directory.
  it('is refused when it dangles through a link the commit itself tracks', () => {
    const shared = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-bridge-'));
    fs.symlinkSync(shared, path.join(dir, 'bridge'));
    git(dir, 'add', 'bridge');
    git(dir, 'commit', '-q', '-m', 'a tracked link out of the repository');
    fs.mkdirSync(path.join(dir, 'node_modules', 'pkg'), { recursive: true });
    fs.symlinkSync(path.join('..', '..', 'bridge', 'newfile'),
      path.join(dir, 'node_modules', 'pkg', 'cache'));

    expect(() => ensureTaskFolder(dir, 'w-bridged')).toThrow(/pkg\/cache/);
    expect(fs.existsSync(taskFolderPath(dir, 'w-bridged'))).toBe(false);
    try { fs.rmSync(shared, { recursive: true, force: true }); } catch {}
  });

  // AND THE CASE THAT MUST NOT MATCH, which this nearly broke: `..deps` is an
  // honest directory name, and asking whether a path starts with ".." reads it
  // as a climb out of the folder. `..` is a component, not a prefix.
  it('is carried when a folder on the way is honestly named ..deps', () => {
    write(path.join(dir, '..deps', 'thing', 'index.js'), 'oddly named\n');
    write(path.join(dir, '.gitignore'), 'node_modules/\n..deps/\nzero.config.json\n');
    write(path.join(dir, '.worktreeinclude'), '/node_modules\n/..deps\n');
    git(dir, 'add', '.gitignore', '.worktreeinclude');
    git(dir, 'commit', '-q', '-m', 'a directory whose name starts with dots');
    fs.symlinkSync(path.join('..', '..deps', 'thing'), path.join(dir, 'node_modules', 'thing'));

    const made = ensureTaskFolder(dir, 'w-dotdotdeps');

    expect(read(made.path, 'node_modules', 'thing', 'index.js')).toBe('oddly named\n');
  });

  // AND AN ENTRY THAT IS ITSELF A LINK IS CHECKED IN THE FOLDER TOO. It used to
  // get no check at all there, because the walk only ran on a real directory, so
  // `node_modules -> .deps` with `.deps` not asked for produced a folder whose
  // dependencies pointed at nothing, and said it had succeeded.
  it('is refused when the entry is a link whose target was not carried in', () => {
    fs.rmSync(path.join(dir, 'node_modules'), { recursive: true, force: true });
    write(path.join(dir, '.deps', 'left-pad', 'index.js'), 'module.exports = 1;\n');
    write(path.join(dir, '.gitignore'), 'node_modules\n.deps/\nzero.config.json\n');
    git(dir, 'add', '.gitignore');
    git(dir, 'commit', '-q', '-m', 'deps live somewhere else');
    fs.symlinkSync('.deps', path.join(dir, 'node_modules'));

    expect(() => ensureTaskFolder(dir, 'w-indirect')).toThrow(/node_modules/);
    expect(fs.existsSync(taskFolderPath(dir, 'w-indirect'))).toBe(false);
  });
});

// BEING NAMED IN .worktreeinclude IS NOT ENOUGH, and finding that out cost a
// review (Codex, 2026-10-07). `ls-files --others --ignored --exclude-from` means
// "untracked files matching THESE rules"; it never consults the repository's own
// .gitignore. So a file the repository does NOT ignore would have been carried
// in, where it stays untracked -- and `parkTaskFolder` runs `git add -A`, so
// closing the task would COMMIT it. A credential named here would have been
// committed onto a branch and pushed.
describe('a local file the repository does not actually ignore', () => {
  let dir;
  beforeEach(() => { dir = repo(); });
  afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

  it('is refused by name rather than carried where closing the task would commit it', () => {
    write(path.join(dir, 'credentials.json'), '{"token":"not in .gitignore"}\n');
    write(path.join(dir, '.worktreeinclude'), 'credentials.json\n');
    git(dir, 'add', '.worktreeinclude');
    git(dir, 'commit', '-q', '-m', 'ask for something not ignored');

    expect(() => ensureTaskFolder(dir, 'w-unignored')).toThrow(/credentials\.json/);
    expect(fs.existsSync(taskFolderPath(dir, 'w-unignored'))).toBe(false);
  });

  // AND THE SAME FILE, ONCE THE REPOSITORY DOES IGNORE IT, comes through. This
  // is the case that must not match: without it the rule above could be "fixed"
  // by refusing everything.
  it('comes through once the repository ignores it', () => {
    write(path.join(dir, 'credentials.json'), '{"token":"now ignored"}\n');
    write(path.join(dir, '.gitignore'), 'node_modules/\nzero.config.json\n.env\nrenderer/dist/\nsecrets/\ncredentials.json\n');
    write(path.join(dir, '.worktreeinclude'), 'credentials.json\n');
    git(dir, 'add', '.gitignore', '.worktreeinclude');
    git(dir, 'commit', '-q', '-m', 'ignore it, then ask for it');

    const made = ensureTaskFolder(dir, 'w-nowignored');

    expect(read(made.path, 'credentials.json')).toBe('{"token":"now ignored"}\n');
    // And it is ignored THERE too, so closing the task cannot commit it.
    expect(git(made.path, 'status', '--porcelain')).toBe('');
  });
});
