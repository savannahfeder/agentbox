// EVERY TASK WORKS IN ITS OWN FOLDER, AND THE APP OWNS IT.
//
// the founder approved this on, 2026-09-22, picking "the app makes the folder
// for both agents" over letting Claude Code make its own and matching the shape
// for Codex.
//
// WHAT WAS MEASURED, AND IS THE WHOLE REASON THIS EXISTS. On her Mac on
// 2026-09-22 this one repository had 25 leftover agent copies holding 26 GB.
// Twelve of them carried edits that were never committed anywhere and twelve
// sat on branches never merged, so the cleanup script could safely delete
// exactly one of them. Two examples: 19 changed files untouched for 24 days,
// and four untouched for 25. That work exists in no other place. It is not in
// her app, not in her inbox, and not on any branch she would ever see, because
// nothing in the app knew those folders existed.
//
// Isolation was a rule in the worker brief rather than something the app did.
// The rule is kept by almost every session and the RETURN half is kept by
// almost none, because folding the work back only happens once she approves,
// and approval rarely lands in the same hour the session dies.
//
// AND IT IS NOT ONLY DISK. main/git-change.mjs photographs a run's checkout at
// spawn and reads it again at exit, and says so in its own comment: "In a
// checkout two agents share, a file the other one wrote inside this run's
// window is inside this run's window, and no reading of the disk can tell them
// apart." So the review card she reads can carry another agent's edits. One
// folder per task makes that card correct by construction.
//
// The folder is named after the TASK and not after the session, which is what
// makes her reply, live steering and remote control land where the work already
// is: the same name hands back the same folder.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  taskFolderPath, ensureTaskFolder, releaseTaskFolder, listTaskFolders,
  parkTaskFolder, restoreTaskFolder,
} from '../main/task-folders.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { waitFor } from './waiting.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** A repository shaped like one of her products: a main branch with a file on it. */
function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-folders-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  fs.writeFileSync(path.join(dir, 'app.txt'), 'one\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'first');
  return dir;
}

// EVERY TEST BELOW IS GIVEN 30 SECONDS, BECAUSE EVERY ONE OF THEM SPAWNS GIT.
//
// Measured on 2026-10-01 (w-3b347985c8): on a Mac with 8.9 to 10.0 GB of swap
// in use, this file went red with "Test timed out in 5000ms", and WHICH test
// died moved between runs: the supervisor's parking test in a full suite run,
// and the second-ask test when the file ran alone minutes later. Nothing was
// wrong with the code. The whole suite took 385s that day against the 25s it is
// documented at, about 15x slow, and on an unloaded machine the slowest tests
// here sit at 666ms, 571ms and 386ms. Multiply those by 15 and they are 10.0s,
// 8.6s and 5.8s, all past vitest's default 5s. That is the whole failure, and
// it explains why it moved: the three slowest tests all cross the line at
// roughly the same amount of load, so load decides which one goes first.
//
// A timeout is the suite's guard against a hang, not a performance assertion,
// and a suite whose red means "the Mac was busy" is worth nothing.
//
// AND THE NUMBER LIVES IN vitest.config.mjs NOW (w-c121bd85e6, 2026-10-04).
// This file answered that by carrying its own 30s, which is TIGHTER than the
// suite's, so raising the suite's did not reach it: on 2026-10-04 the file
// went red again at 103,404 ms with one test over the 30, while the Mac was
// so short of memory that a shell could not start on it. A ceiling written
// beside one describe can only ever be the smaller of the two, which makes it
// the one that fires, so there is no reason to keep one here. `until()` below
// waits 20s, still well inside the suite's, and says what it was waiting for.
describe('the folder a task works in', () => {
  let dir;
  beforeEach(() => { dir = repo(); });
  afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

  it('is made inside the project, named after the task, on its own branch off local main', () => {
    const made = ensureTaskFolder(dir, 'w-282758b486');
    expect(made.path).toBe(taskFolderPath(dir, 'w-282758b486'));
    // Through the real path: on a Mac /var is a symlink into /private/var, and
    // git answers with the resolved spelling. Two spellings of one folder are
    // two folders to every comparison the supervisor makes.
    expect(made.path).toBe(path.join(fs.realpathSync(dir), '.claude', 'worktrees', 'w-282758b486'));
    expect(made.created).toBe(true);
    expect(fs.existsSync(path.join(made.path, 'app.txt'))).toBe(true);
    expect(made.branch).toBe('agentbox/w-282758b486');
    expect(git(made.path, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('agentbox/w-282758b486');
    // Off LOCAL main, because local main carries what has not been pushed yet.
    expect(git(made.path, 'rev-parse', 'HEAD')).toBe(git(dir, 'rev-parse', 'refs/heads/main'));
  });

  // HER REPLY HAS TO LAND WHERE THE WORK IS. The name is the task id, so the
  // second ask is the same folder rather than a second copy of the job.
  it('hands back the same folder when the same task asks again', () => {
    const first = ensureTaskFolder(dir, 'w-282758b486');
    fs.writeFileSync(path.join(first.path, 'app.txt'), 'edited by the first run\n');
    const again = ensureTaskFolder(dir, 'w-282758b486');
    expect(again.path).toBe(first.path);
    expect(again.created).toBe(false);
    expect(fs.readFileSync(path.join(again.path, 'app.txt'), 'utf8')).toBe('edited by the first run\n');
  });

  // THE CASE THE WHOLE ITEM IS FOR: two tasks editing the same filename.
  it('keeps two tasks editing the same file out of each other', () => {
    const one = ensureTaskFolder(dir, 'w-one');
    const two = ensureTaskFolder(dir, 'w-two');
    expect(one.path).not.toBe(two.path);
    fs.writeFileSync(path.join(one.path, 'app.txt'), 'one wrote this\n');
    fs.writeFileSync(path.join(two.path, 'app.txt'), 'two wrote this\n');
    expect(fs.readFileSync(path.join(one.path, 'app.txt'), 'utf8')).toBe('one wrote this\n');
    expect(fs.readFileSync(path.join(two.path, 'app.txt'), 'utf8')).toBe('two wrote this\n');
    // And the shared checkout she runs her app from is untouched by either.
    expect(fs.readFileSync(path.join(dir, 'app.txt'), 'utf8')).toBe('one\n');
  });

  // THE 26 GB RULE, FROM THE OTHER END: a folder is deleted only when losing it
  // costs nothing. Anything else is kept AND REPORTED, because a kept folder
  // nobody is told about is exactly what stranded twelve of hers.
  it('never deletes a folder with uncommitted work in it, and says why', () => {
    const made = ensureTaskFolder(dir, 'w-dirty');
    fs.writeFileSync(path.join(made.path, 'app.txt'), 'work she has not seen\n');
    const out = releaseTaskFolder(dir, 'w-dirty');
    expect(out.removed).toBe(false);
    expect(out.reason).toBe('uncommitted');
    expect(fs.existsSync(made.path)).toBe(true);
  });

  it('keeps a folder whose branch is not in main yet', () => {
    const made = ensureTaskFolder(dir, 'w-unmerged');
    fs.writeFileSync(path.join(made.path, 'app.txt'), 'committed but not merged\n');
    git(made.path, 'add', '.');
    git(made.path, 'commit', '-q', '-m', 'work');
    const out = releaseTaskFolder(dir, 'w-unmerged');
    expect(out.removed).toBe(false);
    expect(out.reason).toBe('unmerged');
    expect(fs.existsSync(made.path)).toBe(true);
  });

  it('deletes a folder once its work is in main', () => {
    const made = ensureTaskFolder(dir, 'w-merged');
    fs.writeFileSync(path.join(made.path, 'app.txt'), 'two\n');
    git(made.path, 'add', '.');
    git(made.path, 'commit', '-q', '-m', 'work');
    git(dir, 'merge', '--ff-only', 'agentbox/w-merged');
    const out = releaseTaskFolder(dir, 'w-merged');
    expect(out.removed).toBe(true);
    expect(fs.existsSync(made.path)).toBe(false);
    // The branch survives the folder. Nothing this does can lose a commit.
    expect(git(dir, 'rev-parse', '--verify', 'refs/heads/agentbox/w-merged')).toBeTruthy();
  });

  // A folder a live session is standing in is never pulled out from under it,
  // which is the one thing `git worktree remove --force` would happily do.
  it('leaves a folder alone while another live session holds it', () => {
    const made = ensureTaskFolder(dir, 'w-held', { pid: process.pid });
    fs.writeFileSync(path.join(made.path, 'app.txt'), 'two\n');
    git(made.path, 'add', '.');
    git(made.path, 'commit', '-q', '-m', 'work');
    git(dir, 'merge', '--ff-only', 'agentbox/w-held');
    // Somebody else's live process holds it: this one is process.pid, so the
    // release asks on behalf of a different session.
    const out = releaseTaskFolder(dir, 'w-held', { pid: process.pid + 1 });
    expect(out.removed).toBe(false);
    expect(out.reason).toBe('held');
    expect(fs.existsSync(made.path)).toBe(true);
  });

  // MOST OF HER PROJECTS HAVE NO CODE AT ALL (23 of her 28 on 2026-09-22), and
  // none of them may change behaviour because of this.
  it('does nothing for a project that is not a git repository', () => {
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'no-repo-'));
    try {
      expect(ensureTaskFolder(plain, 'w-nowhere')).toBe(null);
      expect(listTaskFolders(plain)).toEqual([]);
    } finally { fs.rmSync(plain, { recursive: true, force: true }); }
  });

  // What the app shows her later is read from here, so a stranded folder stops
  // being invisible. This is the half that was missing on her Mac.
  it('lists what exists, with what would be lost by deleting it', () => {
    const clean = ensureTaskFolder(dir, 'w-clean');
    const dirty = ensureTaskFolder(dir, 'w-changed');
    fs.writeFileSync(path.join(dirty.path, 'app.txt'), 'unsaved\n');
    const list = listTaskFolders(dir);
    expect(list.map((f) => f.id).sort()).toEqual(['w-changed', 'w-clean']);
    expect(list.find((f) => f.id === 'w-changed').dirty).toBe(true);
    expect(list.find((f) => f.id === 'w-clean').dirty).toBe(false);
    expect(list.find((f) => f.id === 'w-clean').path).toBe(clean.path);
    expect(list.every((f) => typeof f.branch === 'string')).toBe(true);
  });

  // A name that is not a plain id cannot be allowed to climb out of the folder
  // it belongs in. Store ids are safe today; this is the guard for the day one
  // is not.
  // MEASURED ON HER REPOSITORY, 2026-09-22. A plain `git worktree add` there
  // takes 23 seconds and writes 960 MB, because 634 MB of the checkout is
  // archived screenshots no agent opens. Cloning the checkout beside it takes 5
  // seconds and no measurable disk, because APFS shares the blocks. The clone
  // is only allowed when that checkout is standing on the same commit and is
  // clean, and the result is CHECKED: a fast folder that is subtly not the code
  // would be worse than a slow one.
  it('is identical to the commit however it was made', () => {
    fs.mkdirSync(path.join(dir, 'pictures'));
    fs.writeFileSync(path.join(dir, 'pictures', 'big.txt'), 'x'.repeat(4096));
    git(dir, 'add', '.');
    git(dir, 'commit', '-q', '-m', 'pictures');
    const made = ensureTaskFolder(dir, 'w-clone');
    expect(git(made.path, 'status', '--porcelain')).toBe('');
    expect(fs.readFileSync(path.join(made.path, 'pictures', 'big.txt'), 'utf8').length).toBe(4096);
    expect(git(made.path, 'rev-parse', 'HEAD')).toBe(git(dir, 'rev-parse', 'refs/heads/main'));
  });

  // The clone is only safe from a checkout that IS the commit. A dirty one, or
  // one standing somewhere else, has to fall back to the ordinary checkout, and
  // the folder still has to come out right.
  it('still comes out right when the checkout beside it is dirty', () => {
    fs.writeFileSync(path.join(dir, 'app.txt'), 'someone is mid-edit\n');
    const made = ensureTaskFolder(dir, 'w-dirty-parent');
    expect(git(made.path, 'status', '--porcelain')).toBe('');
    expect(fs.readFileSync(path.join(made.path, 'app.txt'), 'utf8')).toBe('one\n');
  });

  // Folders live inside the repository, so without this every review card built
  // in the shared checkout would carry `.claude/` as a new untracked folder.
  it('is invisible to the checkout it lives inside', () => {
    ensureTaskFolder(dir, 'w-hidden');
    expect(git(dir, 'status', '--porcelain')).toBe('');
  });

  it('refuses a task name that would escape the worktrees folder', () => {
    expect(() => ensureTaskFolder(dir, '../../etc')).toThrow();
    expect(() => taskFolderPath(dir, 'w-ok/../..')).toThrow();
  });
});

/* ================= and the supervisor standing in it ===================== */
// The half that makes any of it true for her: a session has to actually RUN
// there. Everything downstream follows that one word. The snapshot the review
// card is built from is taken of the session's cwd (main/supervisor.mjs, at the
// spawn), the built-in terminal resolves a live session's own folder before the
// product's, and /diff runs where the session runs.

/** A supervisor over a temp store, shaped like the other supervisor tests. */
function supervisorOver(repoPath, rows = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-folder-sup-'));
  const product = { slug: 'agentbox', dir, repoPath };
  const sup = new Supervisor(
    {
      home: path.join(dir, 'home'),
      storeRoot: dir,
      claudeBin: '/nonexistent/claude',
      codexBin: '/nonexistent/codex',
      maxConcurrentSessions: 3,
      authProfiles: ['default'],
      codexHome: path.join(dir, 'codex-home'),
    },
    {
      listItems: () => rows,
      listProducts: () => [product],
      readItem: (slug, id) => rows.find((r) => r.id === id) ?? null,
      isDue: () => true,
      settleAnswer() {},
      recordSessionResult() {},
    },
    '/nonexistent-app',
  );
  return { sup, product, dir };
}

describe('the folder the supervisor runs a row in', () => {
  let dir;
  const made = [];
  beforeEach(() => { dir = repo(); });
  afterEach(() => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    while (made.length) { try { fs.rmSync(made.pop(), { recursive: true, force: true }); } catch {} }
  });

  it('is the row´s own folder, not the checkout her app is built from', () => {
    const { sup, product, dir: store } = supervisorOver(dir);
    made.push(store);
    const cwd = sup.workFolderFor({ id: 'w-282758b486', product: 'agentbox' }, product);
    expect(cwd).toBe(taskFolderPath(dir, 'w-282758b486'));
    expect(fs.existsSync(path.join(cwd, 'app.txt'))).toBe(true);
  });

  it('is the product folder for a project with no repository', () => {
    const { sup, product, dir: store } = supervisorOver(null);
    made.push(store);
    expect(sup.workFolderFor({ id: 'w-282758b486', product: 'agentbox' }, product)).toBe(product.dir);
  });

  // A chat is only handed back when the folder it remembers is a folder this
  // row could have run in. Both spellings count: the row's own folder, and the
  // shared checkout, which is what every record written before today names.
  it('accepts a chat recorded in the row´s folder and one recorded in the checkout', () => {
    const { sup, product, dir: store } = supervisorOver(dir);
    made.push(store);
    const folders = sup.workFolders({ id: 'w-282758b486', product: 'agentbox' }, product);
    expect(folders).toContain(fs.realpathSync(dir));
    expect(folders).toContain(taskFolderPath(dir, 'w-282758b486'));
  });

  // Asking where a row works must never make a folder. This is read on every
  // resume check, and a side effect there would litter the repository with a
  // folder for every row she ever replied to.
  it('does not make anything just by being asked where a row works', () => {
    const { sup, product, dir: store } = supervisorOver(dir);
    made.push(store);
    sup.workFolders({ id: 'w-untouched', product: 'agentbox' }, product);
    expect(fs.existsSync(taskFolderPath(dir, 'w-untouched'))).toBe(false);
  });
});

/* ============ and never on the thread that draws her window ============== */
// Measured on her Mac, 2026-09-27 (w-7deaeca493): with three agents running the
// app's main thread sat in `git` and `cp` for 19 seconds while a task folder was
// made, and 6 more while one was removed. That is the spinning wheel she
// reported "when I complete a task and go into a new one". So a spawn whose row
// has no folder yet hands the folder to a worker thread and comes back to the
// spawn when it exists.
// "timed out" named nothing, so a red run here said only that something had
// not happened. tests/waiting.mjs carries the deadline and the words.
const until = (what, check) => waitFor(what, check);

describe('a spawn that needs a new folder', () => {
  let dir;
  const made = [];
  beforeEach(() => { dir = repo(); });
  afterEach(() => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    while (made.length) { try { fs.rmSync(made.pop(), { recursive: true, force: true }); } catch {} }
  });

  function watched() {
    const { sup, product, dir: store } = supervisorOver(dir);
    made.push(store);
    const spawns = [];
    sup.spawnWorker = (item, opts) => spawns.push({ cwd: sup.workFolderFor(item, product), opts });
    return { sup, product, spawns };
  }

  it('returns at once, and spawns in the row´s folder once it is made', async () => {
    const { sup, product, spawns } = watched();
    const item = { id: 'w-offthread', product: 'agentbox' };
    expect(sup._folderFirst(item, product, 'claude', {})).toBe(true);
    // Nothing was made on this thread, and the row already holds its slot.
    expect(fs.existsSync(taskFolderPath(dir, 'w-offthread'))).toBe(false);
    expect(sup._loadFor('claude')).toBe(1);

    await until('the folder to be made and the spawn to follow', () => spawns.length === 1);
    expect(spawns[0].cwd).toBe(taskFolderPath(dir, 'w-offthread'));
    expect(fs.existsSync(path.join(spawns[0].cwd, 'app.txt'))).toBe(true);
    expect(sup._loadFor('claude')).toBe(0);
  });

  it('runs the latest ask once, when a second arrives while it waits', async () => {
    const { sup, product, spawns } = watched();
    const item = { id: 'w-asked-twice', product: 'agentbox' };
    sup._folderFirst(item, product, 'claude', {});
    expect(sup._folderFirst({ ...item, answer: 'go' }, product, 'claude', { continuation: true })).toBe(true);
    await until('the one spawn the two asks share', () => spawns.length === 1);
    await new Promise((r) => setTimeout(r, 100));
    expect(spawns.length).toBe(1);
    expect(spawns[0].opts.continuation).toBe(true);
  });

  it('never starts a row she stopped while its folder was being made', async () => {
    const { sup, product, spawns } = watched();
    sup._folderFirst({ id: 'w-stopped', product: 'agentbox' }, product, 'claude', {});
    expect(sup.stopSession('w-stopped')).toBe(true);
    await until('the folder to be made for the row she stopped', () => fs.existsSync(taskFolderPath(dir, 'w-stopped')));
    await new Promise((r) => setTimeout(r, 100));
    expect(spawns.length).toBe(0);
  });

  it('leaves a row that already has its folder to the ordinary spawn', () => {
    const { sup, product } = watched();
    ensureTaskFolder(dir, 'w-has-one');
    expect(sup._folderFirst({ id: 'w-has-one', product: 'agentbox' }, product, 'claude', {})).toBe(false);
  });
});

/* ===================== when she closes a task ============================= */
// A closed row's folder is worth reclaiming, but a row can be closed by
// accident, and a row closed on the understanding that it can be picked up
// again later is not really finished with its code.
//
// THE ANSWER IS NOT A TIMER. A timer deletes work while she is not looking, and
// losing something she needed is the only outcome it can produce that keeping
// the folder would not. What makes a folder disposable is that nothing in it
// exists only there: the branch holds every commit, so the one thing genuinely
// at risk is work an agent left uncommitted.
//
// So closing a task PARKS it. Whatever is uncommitted is committed onto the
// task's own branch, and only then is the folder removed. Reopening undoes that
// commit, so the session comes back to exactly the files it left. Nothing is
// deleted that git is not holding, the branch is never deleted, and an
// accidental close costs the ten seconds it takes to make the folder again.
describe('parking a closed task', () => {
  let dir;
  beforeEach(() => { dir = repo(); });
  afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

  it('commits what was left behind onto the task branch, then takes the folder', () => {
    const folder = ensureTaskFolder(dir, 'w-closed');
    fs.writeFileSync(path.join(folder.path, 'app.txt'), 'half finished\n');
    fs.writeFileSync(path.join(folder.path, 'new-file.txt'), 'never committed\n');

    const out = parkTaskFolder(dir, 'w-closed');
    expect(out.parked).toBe(true);
    expect(out.kept).toBe('work in progress');
    expect(fs.existsSync(folder.path)).toBe(false);
    const files = git(dir, 'show', '--name-only', '--format=', 'agentbox/w-closed').trim().split('\n').sort();
    expect(files).toEqual(['app.txt', 'new-file.txt']);
  });

  it('gives it all back, uncommitted, exactly as it was', () => {
    const folder = ensureTaskFolder(dir, 'w-reopened');
    fs.writeFileSync(path.join(folder.path, 'app.txt'), 'half finished\n');
    fs.writeFileSync(path.join(folder.path, 'new-file.txt'), 'never committed\n');
    const before = git(folder.path, 'status', '--porcelain');

    parkTaskFolder(dir, 'w-reopened');
    const back = restoreTaskFolder(dir, 'w-reopened');

    expect(back.path).toBe(folder.path);
    expect(fs.readFileSync(path.join(back.path, 'app.txt'), 'utf8')).toBe('half finished\n');
    expect(fs.readFileSync(path.join(back.path, 'new-file.txt'), 'utf8')).toBe('never committed\n');
    // Uncommitted again, and the parking commit is off the branch, so reopening
    // twice cannot build a stack of them.
    expect(git(back.path, 'status', '--porcelain')).toBe(before);
    expect(git(back.path, 'log', '--format=%s', '-1')).toBe('first');
  });

  it('keeps the branch when there was nothing uncommitted to keep', () => {
    const folder = ensureTaskFolder(dir, 'w-tidy');
    fs.writeFileSync(path.join(folder.path, 'app.txt'), 'two\n');
    git(folder.path, 'add', '.');
    git(folder.path, 'commit', '-q', '-m', 'the work itself');

    const out = parkTaskFolder(dir, 'w-tidy');
    expect(out.parked).toBe(true);
    expect(out.kept).toBe('nothing uncommitted');
    expect(fs.existsSync(folder.path)).toBe(false);
    expect(git(dir, 'log', '--format=%s', '-1', 'agentbox/w-tidy')).toBe('the work itself');
  });

  // And the supervisor deciding WHICH folders those are. She closes rows while
  // nothing at all is running, so this cannot only happen when a session exits.
  it('is what the supervisor does to a finished row and not to a live one', async () => {
    const open = ensureTaskFolder(dir, 'w-still-open');
    const closed = ensureTaskFolder(dir, 'w-finished');
    fs.writeFileSync(path.join(open.path, 'app.txt'), 'still going\n');
    fs.writeFileSync(path.join(closed.path, 'app.txt'), 'she marked this done\n');

    const { sup, product, dir: store } = supervisorOver(dir, [
      { id: 'w-still-open', product: 'agentbox', status: 'open' },
      { id: 'w-finished', product: 'agentbox', status: 'done' },
    ]);
    try {
      expect(await sup.parkClosedFolders(product)).toBe(1);
      expect(fs.existsSync(closed.path)).toBe(false);
      expect(fs.existsSync(open.path)).toBe(true);
      // And the closed one's work is on its branch, not lost with the folder.
      expect(git(dir, 'show', 'agentbox/w-finished:app.txt')).toBe('she marked this done');
    } finally { fs.rmSync(store, { recursive: true, force: true }); }
  });

  // The one case where taking the folder would be taking it out from under
  // somebody: a session standing in it right now.
  it('never parks a folder a live session is holding', () => {
    const folder = ensureTaskFolder(dir, 'w-busy', { pid: process.pid });
    fs.writeFileSync(path.join(folder.path, 'app.txt'), 'being written right now\n');
    const out = parkTaskFolder(dir, 'w-busy', { pid: process.pid + 1 });
    expect(out.parked).toBe(false);
    expect(out.reason).toBe('held');
    expect(fs.existsSync(folder.path)).toBe(true);
  });
});
