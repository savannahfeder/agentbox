// A THREAD CLOSED WHILE IT WAITS TO SHIP STILL SHIPS.
//
// What broke: an agent labels its thread `ship` and ends with "Close this
// task". The ship queue runs one thread at a time, and a ship can take twelve
// minutes, so a thread is easily closed before its turn. The queue skipped
// closed threads, and the folder sweep then put the closed thread's folder
// away, so the approved ship never ran and nothing said so. Measured here
// against the queue and the sweep themselves.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { SHIP_LABEL, ShipQueue, nextToShip } from '../main/ship-queue.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { ensureTaskFolder } from '../main/task-folders.mjs';

let tmp; let repo; let userDir;
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();
beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'closed-ships-')));
  repo = path.join(tmp, 'repo');
  userDir = path.join(tmp, 'user');
  fs.mkdirSync(path.join(repo, 'scripts'), { recursive: true });
  fs.mkdirSync(userDir, { recursive: true });
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.email', 'test@example.com');
  git(repo, 'config', 'user.name', 'Test');
  fs.writeFileSync(path.join(repo, 'scripts', 'ship.mjs'), '');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'first');
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const products = () => [{ slug: 'team', repoPath: repo }, { slug: 'other', repoPath: repo }];
const settings = { team: { script: 'scripts/ship.mjs' } };
const shipsHere = () => fs.writeFileSync(path.join(userDir, 'ship.json'), JSON.stringify(settings));
const folderFor = (item) => path.join(repo, '.claude', 'worktrees', item.id);
const row = (id, over = {}) => ({ id, product: 'team', status: 'done', labels: [SHIP_LABEL], updatedAt: 1000, wrote: { labels: { ts: 1000 } }, ...over });
const queue = () => new ShipQueue({ store: {}, userDir, folderFor, isLive: () => false });

describe('the ship queue', () => {
  it('ships a thread closed after its agent marked it ready', () => {
    ensureTaskFolder(repo, 'w-closed');
    expect(nextToShip([row('w-closed')], products(), settings, { folderFor })?.item.id).toBe('w-closed');
  });

  it('does not list a closed thread as shipping, so it stays in Done', () => {
    shipsHere();
    ensureTaskFolder(repo, 'w-closed');
    ensureTaskFolder(repo, 'w-open');
    expect(queue().waitingIds([row('w-closed'), row('w-open', { status: 'blocked' })], products())).toEqual(['w-open']);
  });

  it('owes a ship to a closed thread until it has tried, and never to a project that does not ship', () => {
    shipsHere();
    ensureTaskFolder(repo, 'w-closed');
    const q = queue();
    expect(q.owes(row('w-closed'), products())).toBe(true);
    expect(q.owes(row('w-closed', { labels: ['ui'] }), products())).toBe(false);
    expect(q.owes(row('w-closed', { product: 'other' }), products())).toBe(false);
    fs.writeFileSync(path.join(userDir, 'ship-handled.json'), JSON.stringify({ 'team/w-closed': 1000 }));
    expect(q.owes(row('w-closed'), products())).toBe(false);
  });
});

describe('the folder sweep', () => {
  it('keeps the folder of a closed thread still owed a ship, and puts the others away', async () => {
    const owed = ensureTaskFolder(repo, 'w-owed');
    const quiet = ensureTaskFolder(repo, 'w-quiet');
    fs.writeFileSync(path.join(owed.path, 'change.txt'), 'to ship\n');
    fs.writeFileSync(path.join(quiet.path, 'change.txt'), 'nothing to ship\n');
    const rows = [row('w-owed'), row('w-quiet', { labels: [] })];
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'closed-ships-sup-'));
    const product = { slug: 'team', dir, repoPath: repo };
    const sup = new Supervisor(
      { home: path.join(dir, 'home'), storeRoot: dir, claudeBin: '/nonexistent/claude', codexBin: '/nonexistent/codex', authProfiles: ['default'], codexHome: path.join(dir, 'codex-home') },
      { listItems: () => rows, listProducts: () => [product], readItem: (slug, id) => rows.find((r) => r.id === id) ?? null, isDue: () => true, settleAnswer() {}, recordSessionResult() {} },
      '/nonexistent-app',
    );
    try {
      sup.shipQueue = { owes: (item) => item.id === 'w-owed' };
      expect(await sup.parkClosedFolders(product)).toBe(1);
      expect(fs.existsSync(owed.path)).toBe(true);
      expect(fs.existsSync(quiet.path)).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
