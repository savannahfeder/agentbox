// A COPY OF THE PROJECT THE APP DID NOT MAKE IS STILL ON THE DISK, AND THE APP
// COULD NOT SEE ONE (w-330eea6c66).
//
// WHAT WAS MEASURED, 2026-10-07 (w-5952e6de3e). Thirteen worktrees of this
// repository existed outside `.claude/worktrees/`: nine beside the checkout as
// `agentbox-team-<name>`, one under `/private/tmp`, one as `wt-<task id>`. About
// 740 MB of tracked files, every one of them made by hand by some session rather
// than by the app. `listTaskFolders` filtered on the folder's parent being the
// app's own home, so not one of them could be listed, shown or swept. That is
// the same invisibility that stranded 26 GB on 2026-09-22, in a new place. One
// of them had `node_modules` symlinked back to the shared checkout, so an
// `npm install` inside it rewrote every other folder's dependencies.
//
// AND WIDENING THE FILTER WOULD HAVE BEEN WORSE THAN THE BUG. The supervisor
// feeds the same list into automatic parking, and parking rebuilt
// `.claude/worktrees/<id>` out of the folder's BASENAME rather than using the
// path it was handed. A folder nobody's row owns passes parking's eligibility
// checks, so a wider list would have had the app committing to a branch it
// invented and deleting a folder a person made on purpose.
//
// SO INVENTORY AND OWNERSHIP ARE TWO QUESTIONS. Inventory is every worktree git
// knows about, strays included, so a person can see what is holding disk.
// Ownership is the much smaller set the app made and can prove it made, and only
// those are ever parked or removed. Every test below pins one half of that line.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ensureTaskFolder, taskFolderPath, buildingFolderPath, listTaskFolders,
  inventoryWorktrees, strayWorktrees, pruneMissingWorktrees,
  releaseTaskFolder, parkTaskFolder, PARKED,
} from '../main/task-folders.mjs';
import { strayFolderSettings } from '../main/settings.mjs';
import { Supervisor } from '../main/supervisor.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** A repository shaped like one of her products: a main branch with a file on it. */
function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stray-worktrees-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  fs.writeFileSync(path.join(dir, 'app.txt'), 'one\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'first');
  return dir;
}

const found = (list, at) => list.find((w) => w.path === fs.realpathSync(at)) ?? null;

describe('every copy of the project, whether the app made it or not', () => {
  let dir;
  let elsewhere;
  beforeEach(() => {
    dir = repo();
    elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'by-hand-'));
  });
  afterEach(() => {
    for (const d of [dir, elsewhere]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
  });

  // THE REPORTED CASE: nine of these were sitting beside her checkout.
  it('finds one a session made by hand beside the checkout, and says it is not ours', () => {
    const made = ensureTaskFolder(dir, 'w-ours');
    const stray = path.join(elsewhere, 'website-fontsize');
    git(dir, 'worktree', 'add', '-q', '-b', 'fontsize', stray);

    const all = inventoryWorktrees(dir);
    expect(found(all, stray)).toBeTruthy();
    expect(found(all, stray).ours).toBe(false);
    expect(found(all, stray).primary).toBe(false);
    expect(found(all, stray).branch).toBe('fontsize');
    // And the app's own folder is still the app's own.
    expect(found(all, made.path).ours).toBe(true);

    expect(strayWorktrees(dir).map((w) => w.path)).toEqual([fs.realpathSync(stray)]);
  });

  // THE CASE THAT MUST NOT MATCH, and the whole reason this is two questions
  // rather than one filter: a stray may never reach the list the sweep reads.
  it('still lists only the app´s own folders as task folders', () => {
    const made = ensureTaskFolder(dir, 'w-ours');
    git(dir, 'worktree', 'add', '-q', '-b', 'by-hand', path.join(elsewhere, 'by-hand'));
    expect(listTaskFolders(dir).map((f) => f.path)).toEqual([made.path]);
  });

  // The checkout her app runs from is in git's list too, and it is nobody's
  // stray: naming it one would put the project itself on a page about waste.
  it('marks the checkout itself as the primary and never as a stray', () => {
    const here = found(inventoryWorktrees(dir), dir);
    expect(here.primary).toBe(true);
    expect(here.ours).toBe(false);
    expect(strayWorktrees(dir)).toEqual([]);
  });

  // THE BOUNDARY ON THE INSIDE. `.claude/w-x` and `.claude/worktrees/w-x/inner`
  // are both inside the repository and neither is the app's own home, so
  // neither may be treated as a folder the app made and may delete.
  it('is not fooled by a folder that is near the app´s own home without being in it', () => {
    const near = path.join(fs.realpathSync(dir), '.claude', 'w-not-in-the-home');
    git(dir, 'worktree', 'add', '-q', '-b', 'near', near);
    const record = found(inventoryWorktrees(dir), near);
    expect(record.ours).toBe(false);
    expect(strayWorktrees(dir).map((w) => w.path)).toEqual([fs.realpathSync(near)]);
    expect(listTaskFolders(dir)).toEqual([]);
  });

  it('is not fooled by a folder nested inside one of the app´s own', () => {
    const mine = ensureTaskFolder(dir, 'w-outer');
    const inner = path.join(mine.path, 'inner');
    git(dir, 'worktree', 'add', '-q', '-b', 'inner', inner);
    expect(found(inventoryWorktrees(dir), inner).ours).toBe(false);
    expect(listTaskFolders(dir).map((f) => f.path)).toEqual([mine.path]);
  });

  // A folder still being built is the app's, and is wanted by nobody: it may
  // never be listed as a task folder, and it is not a stray either.
  it('leaves a folder still being built out of both answers', () => {
    const staging = buildingFolderPath(dir, 'w-half-made');
    git(dir, 'worktree', 'add', '-q', '-b', 'agentbox/w-half-made', staging);
    const record = found(inventoryWorktrees(dir), staging);
    expect(record.unfinished).toBe(true);
    expect(record.ours).toBe(false);
    expect(strayWorktrees(dir)).toEqual([]);
    expect(listTaskFolders(dir)).toEqual([]);
  });

  // THE OTHER HALF OF THE REPORT: one of the thirteen was under `/private/tmp`,
  // which macOS may purge, leaving a registration pointing at nothing.
  it('reports a registration whose folder has gone, and drops it on request', () => {
    const purged = path.join(elsewhere, 'w-b59cbe3154-wt');
    git(dir, 'worktree', 'add', '-q', '-b', 'purged', purged);
    const at = fs.realpathSync(purged);
    fs.rmSync(purged, { recursive: true, force: true });

    const record = inventoryWorktrees(dir).find((w) => w.path === at);
    expect(record.missing).toBe(true);
    expect(record.ours).toBe(false);

    expect(pruneMissingWorktrees(dir)).toEqual([at]);
    expect(inventoryWorktrees(dir).some((w) => w.path === at)).toBe(false);
    // Nothing is lost by it: the branch the folder stood on is still here.
    expect(git(dir, 'rev-parse', '--verify', 'refs/heads/purged')).toBeTruthy();
    // And with nothing missing there is nothing to drop.
    expect(pruneMissingWorktrees(dir)).toEqual([]);
  });

  // THE SAME THING ON THE APP'S OWN SIDE, and it needs the extra step: every
  // folder the app makes is locked, `git worktree prune` skips a locked worktree,
  // so a folder of ours somebody deleted by hand would leave its registration
  // wedged there forever and refuse the next folder for that task.
  it('drops the registration of one of its own that somebody deleted by hand', () => {
    const mine = ensureTaskFolder(dir, 'w-deleted-by-hand');
    expect(found(inventoryWorktrees(dir), mine.path).lock).toContain('pid=');
    fs.rmSync(mine.path, { recursive: true, force: true });

    expect(inventoryWorktrees(dir).find((w) => w.path === mine.path).missing).toBe(true);
    expect(pruneMissingWorktrees(dir)).toEqual([mine.path]);
    // And the task can have a folder again, which is what the wedge prevented.
    expect(ensureTaskFolder(dir, 'w-deleted-by-hand').path).toBe(mine.path);
  });

  // On a Mac `/tmp` and `/var` are symlinks into `/private`, so a folder made by
  // one spelling and compared by the other is two folders to every check here.
  it('answers through the real path, so one folder is never two', () => {
    const made = ensureTaskFolder(dir, 'w-spelling');
    for (const w of inventoryWorktrees(dir)) expect(w.path).toBe(fs.realpathSync(w.path));
    expect(found(inventoryWorktrees(dir), made.path).ours).toBe(true);
  });

  // Asked about a folder that is no checkout at all, this says nothing rather
  // than throwing: 23 of her 28 projects on 2026-09-22 had no code in them.
  it('says nothing about a project that is not a git repository', () => {
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'no-repo-'));
    try {
      expect(inventoryWorktrees(plain)).toEqual([]);
      expect(strayWorktrees(plain)).toEqual([]);
      expect(pruneMissingWorktrees(plain)).toEqual([]);
    } finally { fs.rmSync(plain, { recursive: true, force: true }); }
  });
});

/* ========== parking and releasing act on the path they were given ========= */
// Both used to take a task id and rebuild `.claude/worktrees/<id>` from it. That
// is fine while the only caller is a row's own session, and it is the bug the
// moment anything hands over a folder it found: a stray whose basename happens
// to read like a task id would have had the app committing in, and deleting,
// whatever sat at the reconstructed path instead.
describe('parking and releasing a folder somebody named', () => {
  let dir;
  let elsewhere;
  beforeEach(() => {
    dir = repo();
    elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'by-hand-'));
  });
  afterEach(() => {
    for (const d of [dir, elsewhere]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
  });

  it('parks the app´s own folder when the path given is that folder', () => {
    const mine = ensureTaskFolder(dir, 'w-closed');
    fs.writeFileSync(path.join(mine.path, 'app.txt'), 'half finished\n');
    const out = parkTaskFolder(dir, 'w-closed', { path: mine.path });
    expect(out.parked).toBe(true);
    expect(fs.existsSync(mine.path)).toBe(false);
    expect(git(dir, 'log', '--format=%s', '-1', 'agentbox/w-closed')).toBe(PARKED);
  });

  it('refuses to park a folder that is not the one the app made for that task', () => {
    const stray = path.join(elsewhere, 'w-trap');
    git(dir, 'worktree', 'add', '-q', '-b', 'stray/w-trap', stray);
    fs.writeFileSync(path.join(stray, 'app.txt'), 'somebody´s own work\n');

    const out = parkTaskFolder(dir, 'w-trap', { path: stray });
    expect(out.parked).toBe(false);
    expect(out.reason).toBe('not-ours');
    // Untouched: still there, still uncommitted, and no commit on its branch.
    expect(fs.existsSync(stray)).toBe(true);
    expect(git(stray, 'status', '--porcelain')).toContain('app.txt');
    expect(git(dir, 'log', '--format=%s', '-1', 'stray/w-trap')).toBe('first');
  });

  it('refuses to release a folder that is not the one the app made for that task', () => {
    const stray = path.join(elsewhere, 'w-trap');
    git(dir, 'worktree', 'add', '-q', '-b', 'stray/w-trap', stray);
    const out = releaseTaskFolder(dir, 'w-trap', { path: stray });
    expect(out.removed).toBe(false);
    expect(out.reason).toBe('not-ours');
    expect(fs.existsSync(stray)).toBe(true);
  });

  // And a task id with no folder of its own still answers the way it always
  // did, because that is every ordinary call: a session letting go of its row.
  it('still works from the task id alone, which is every ordinary call', () => {
    const mine = ensureTaskFolder(dir, 'w-plain');
    expect(parkTaskFolder(dir, 'w-plain').parked).toBe(true);
    expect(fs.existsSync(mine.path)).toBe(false);
    expect(releaseTaskFolder(dir, 'w-plain').reason).toBe('gone');
  });
});

/* ================ and the sweep that runs without anybody asking ========== */
/** A supervisor over a temp store, shaped like the other supervisor tests. */
function supervisorOver(repoPath, rows = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stray-sup-'));
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
  return { sup, product, store: dir };
}

describe('the sweep that puts finished rows´ folders away', () => {
  let dir;
  let elsewhere;
  const made = [];
  beforeEach(() => {
    dir = repo();
    elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'by-hand-'));
  });
  afterEach(() => {
    for (const d of [dir, elsewhere, ...made]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
    made.length = 0;
  });

  // THE FAILURE THE REPORT ASKED US NOT TO BUILD. A folder made by hand, named
  // after a row that is finished, is the exact shape that would pass every
  // eligibility check parking has. It is nobody's task folder, so it is left
  // completely alone: no commit, no removal, not counted.
  it('never touches a folder made by hand, even one named after a finished row', async () => {
    const stray = path.join(elsewhere, 'w-finished');
    git(dir, 'worktree', 'add', '-q', '-b', 'stray/w-finished', stray);
    fs.writeFileSync(path.join(stray, 'app.txt'), 'somebody´s own work\n');

    const { sup, product, store } = supervisorOver(dir, [
      { id: 'w-finished', product: 'agentbox', status: 'done' },
    ]);
    made.push(store);
    expect(await sup.parkClosedFolders(product)).toBe(0);
    expect(fs.existsSync(stray)).toBe(true);
    expect(git(stray, 'status', '--porcelain')).toContain('app.txt');
    expect(git(dir, 'log', '--format=%s', '-1', 'stray/w-finished')).toBe('first');
  });

  // And the folder beside it that IS the app's own still goes, so the sweep did
  // not simply stop working.
  it('still puts away the app´s own folder for that same finished row', async () => {
    const mine = ensureTaskFolder(dir, 'w-finished');
    fs.writeFileSync(path.join(mine.path, 'app.txt'), 'she marked this done\n');
    const stray = path.join(elsewhere, 'w-finished');
    git(dir, 'worktree', 'add', '-q', '-b', 'stray/w-finished', stray);

    const { sup, product, store } = supervisorOver(dir, [
      { id: 'w-finished', product: 'agentbox', status: 'done' },
    ]);
    made.push(store);
    expect(await sup.parkClosedFolders(product)).toBe(1);
    expect(fs.existsSync(mine.path)).toBe(false);
    expect(git(dir, 'show', 'agentbox/w-finished:app.txt')).toBe('she marked this done');
    expect(fs.existsSync(stray)).toBe(true);
  });

  // A registration pointing at nothing is dropped on the way past, because git
  // keeping it is what refuses the next `worktree add` at that path.
  it('drops a registration whose folder macOS purged', async () => {
    const purged = path.join(elsewhere, 'w-b59cbe3154-wt');
    git(dir, 'worktree', 'add', '-q', '-b', 'purged', purged);
    const at = fs.realpathSync(purged);
    fs.rmSync(purged, { recursive: true, force: true });

    const { sup, product, store } = supervisorOver(dir);
    made.push(store);
    await sup.parkClosedFolders(product);
    expect(inventoryWorktrees(dir).some((w) => w.path === at)).toBe(false);
    expect(git(dir, 'rev-parse', '--verify', 'refs/heads/purged')).toBeTruthy();
  });

  // The sweep is also where the app learns what the strays are, so the page can
  // say so without reading the disk on the window's thread.
  it('remembers the strays it walked past, so a page can name them', async () => {
    const stray = path.join(elsewhere, 'website-fontsize');
    git(dir, 'worktree', 'add', '-q', '-b', 'fontsize', stray);
    const { sup, product, store } = supervisorOver(dir);
    made.push(store);
    await sup.parkClosedFolders(product);
    expect(sup.strayFolders().map((w) => w.path)).toEqual([fs.realpathSync(stray)]);
  });
});

/* ===================== what the app says about them ====================== */
// The half that was missing on her Mac: 740 MB she had never been shown. The row
// only appears when there is something to say, and it offers no button, because
// a folder the app did not make is not the app's to remove.
describe('the sentence the page carries about folders the app did not make', () => {
  const page = (strays) => strayFolderSettings({ supervisor: { strayFolders: () => strays } }, '/Users/you');

  it('says nothing at all when there are none', () => {
    expect(page([])).toBe(null);
    expect(strayFolderSettings({ supervisor: {} })).toBe(null);
  });

  it('names one, with the project it is a copy of', () => {
    const out = page([{ path: '/Users/you/Desktop/dev/website-fontsize', project: 'Website', branch: 'fontsize' }]);
    expect(out.count).toBe(1);
    expect(out.now).toContain('~/Desktop/dev/website-fontsize');
    expect(out.now).toContain('Website');
    expect(out.now).toMatch(/^1 copy/);
    // No account name in what the page draws.
    expect(out.now).not.toContain('/Users/you');
  });

  it('counts several and names the first few', () => {
    const out = page(Array.from({ length: 9 }, (_, i) => ({
      path: `/Users/you/Desktop/dev/website-${i}`, project: 'Website', branch: `b${i}`,
    })));
    expect(out.count).toBe(9);
    expect(out.now).toMatch(/^9 copies/);
    expect(out.now).toContain('~/Desktop/dev/website-0');
    expect(out.now).toContain('and 6 more');
    expect(out.now).not.toContain('website-8');
  });
});
