// A SHIPPED THREAD LEFT ITS WORKTREE BEHIND, LOCKED (F-81, QA batch 004).
//
// How it was measured, 2026-10-26: two threads in Web Todo were shipped to main
// in one session. Three days later `git worktree list` still showed
// `.claude/worktrees/w-756c4db2c5  4f6751f [agentbox/w-756c4db2c5] locked`,
// whose commit is an ancestor of main, while the other thread's folder was
// gone. Both threads were still waiting in Needs you.
//
// The rule was always right and nothing was running it. A folder is reclaimed
// only when losing it costs nothing (clean, and its branch in main), and the
// two places that asked were a session ending and the sweep over CLOSED rows.
// A thread that ships and then waits for you is neither, so the one moment its
// folder became free to take was a moment nobody looked.
//
// So the ship asks, and the sweep asks again for every row the app's own note
// says it shipped. Which is only ever the same question: anything uncommitted,
// or any commit not yet on main, and the folder stays exactly as before.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureTaskFolder, taskFolderPath } from '../main/task-folders.mts';
import { shippedNote } from '../shared/shipped-note.mjs';
import { Supervisor } from '../main/supervisor.mts';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

function repo() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'shipped-folder-')));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  fs.writeFileSync(path.join(dir, 'app.txt'), 'one\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'first');
  return dir;
}

/** A thread's folder with a commit on its branch, that commit now on main. */
function folderWhoseWorkLanded(dir, id, what = 'the change itself\n') {
  const made = ensureTaskFolder(dir, id, { dependencies: false });
  fs.writeFileSync(path.join(made.path, 'app.txt'), what);
  git(made.path, 'add', '.');
  git(made.path, 'commit', '-q', '-m', 'the change itself');
  git(dir, 'merge', '-q', '--ff-only', `agentbox/${id}`);
  return made.path;
}

function supervisorOver(repoPath, rows) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipped-folder-sup-'));
  const product = { slug: 'agentbox', dir, repoPath };
  const sup = new Supervisor(
    {
      home: path.join(dir, 'home'), storeRoot: dir,
      claudeBin: '/nonexistent/claude', codexBin: '/nonexistent/codex',
      maxConcurrentSessions: 3, authProfiles: ['default'], codexHome: path.join(dir, 'codex-home'),
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

/** A row carrying the app's own shipped note, which is the only one that counts. */
const shippedRow = (id, sha = 'abc1234') => ({
  id, product: 'agentbox', status: 'open', note: shippedNote(sha),
  wrote: { note: { source: 'system', ts: 2 } },
});

let dir;
let stores;
beforeEach(() => { dir = repo(); stores = []; });
afterEach(() => {
  for (const p of [dir, ...stores]) { try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* gone */ } }
});

const over = (rows) => { const made = supervisorOver(dir, rows); stores.push(made.dir); return made; };
const worktrees = () => git(dir, 'worktree', 'list', '--porcelain');

describe('the moment the ship lands', () => {
  it('hands the folder back, so no locked worktree is left behind', async () => {
    const folder = folderWhoseWorkLanded(dir, 'w-shipped');
    expect(worktrees()).toContain(folder);
    const { sup, product } = over([shippedRow('w-shipped')]);

    await sup.reclaimShippedFolder({ item: { id: 'w-shipped', product: 'agentbox' }, product });

    expect(fs.existsSync(folder)).toBe(false);
    expect(worktrees()).not.toContain(folder);
  }, 30_000);

  it('is what the ship queue asks for, with the row and the project', async () => {
    const source = fs.readFileSync(new URL('../main/supervisor.mts', import.meta.url), 'utf8');
    expect(source).toMatch(/afterShip: \(shipped\) => \{[^}]*this\.reclaimShippedFolder\(shipped\)/);
  });
});

describe('the sweep, for a ship whose folder outlived the run that made it', () => {
  it('takes the folder of a waiting thread the app says it shipped', async () => {
    const folder = folderWhoseWorkLanded(dir, 'w-waiting');
    const { sup, product } = over([shippedRow('w-waiting')]);

    expect(await sup.parkClosedFolders(product)).toBe(1);
    expect(fs.existsSync(folder)).toBe(false);
  }, 30_000);

  it('leaves the folder of a waiting thread that has not shipped', async () => {
    const folder = folderWhoseWorkLanded(dir, 'w-unshipped');
    const { sup, product } = over([{ id: 'w-unshipped', product: 'agentbox', status: 'open' }]);

    expect(await sup.parkClosedFolders(product)).toBe(0);
    expect(fs.existsSync(folder)).toBe(true);
  }, 30_000);

  it('leaves a shipped thread\'s folder alone while anything in it is uncommitted', async () => {
    const folder = folderWhoseWorkLanded(dir, 'w-still-writing');
    fs.writeFileSync(path.join(folder, 'notes.txt'), 'written after the ship\n');
    const { sup, product } = over([shippedRow('w-still-writing')]);

    expect(await sup.parkClosedFolders(product)).toBe(0);
    expect(fs.existsSync(folder)).toBe(true);
    expect(fs.readFileSync(path.join(folder, 'notes.txt'), 'utf8')).toBe('written after the ship\n');
  }, 30_000);

  it('leaves a shipped thread\'s folder alone while it holds a commit main has not got', async () => {
    const folder = folderWhoseWorkLanded(dir, 'w-one-more');
    fs.writeFileSync(path.join(folder, 'app.txt'), 'one more go\n');
    git(folder, 'commit', '-q', '-am', 'one more go');
    const { sup, product } = over([shippedRow('w-one-more')]);

    expect(await sup.parkClosedFolders(product)).toBe(0);
    expect(fs.existsSync(folder)).toBe(true);
  }, 30_000);

  it('leaves it alone once you have replied, because the thread is live again', async () => {
    const folder = folderWhoseWorkLanded(dir, 'w-replied');
    const row = shippedRow('w-replied');
    row.answer = 'one more thing';
    row.wrote.answer = { source: 'founder', ts: 3 };
    const { sup, product } = over([row]);

    expect(await sup.parkClosedFolders(product)).toBe(0);
    expect(fs.existsSync(folder)).toBe(true);
  }, 30_000);

  it('never takes one a session is standing in', async () => {
    const folder = folderWhoseWorkLanded(dir, 'w-busy');
    const { sup, product } = over([shippedRow('w-busy')]);
    sup.sessions.set('w-busy', { startedAt: Date.now() });

    expect(await sup.parkClosedFolders(product)).toBe(0);
    expect(fs.existsSync(folder)).toBe(true);
  }, 30_000);
});

// The branch is the one copy of the work that survives the folder, and the
// whole argument for deleting the folder rests on it (main/task-folders.mts:
// "Branches are never deleted here").
describe('what is kept whatever happens', () => {
  it('keeps the thread\'s branch and its commit', async () => {
    const folder = folderWhoseWorkLanded(dir, 'w-kept');
    const { sup, product } = over([shippedRow('w-kept')]);

    await sup.parkClosedFolders(product);

    expect(fs.existsSync(folder)).toBe(false);
    expect(git(dir, 'show', 'agentbox/w-kept:app.txt')).toBe('the change itself');
    expect(taskFolderPath(dir, 'w-kept')).toBe(folder);
  }, 30_000);
});
