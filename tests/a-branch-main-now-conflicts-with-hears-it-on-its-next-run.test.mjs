// A BRANCH MAIN NOW CONFLICTS WITH HEARS IT ON ITS NEXT RUN.
//
// A ship landing on main could leave another thread's open branch in conflict
// with it, and that thread only found out at its own ship, after it had
// finished, when the person was the one asked to sort it out. Measured with a
// real repository: after a ship landed nothing looked at the other task
// folders, and the next run's prompt said nothing about main.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ShipQueue, SHIP_LABEL } from '../main/ship-queue.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { conflictingBranches, git, threads } from './helpers/conflicting-branches.mjs';

let repo; let userDir;
beforeEach(() => {
  repo = conflictingBranches();
  userDir = path.join(repo.tmp, 'user');
  fs.mkdirSync(userDir);
  fs.writeFileSync(path.join(userDir, 'ship.json'), JSON.stringify({ team: { script: 'ship.mjs' } }));
});
afterEach(() => repo.cleanUp());

const products = () => [{ slug: 'team', repoPath: repo.base }];
const row = (id, over = {}) => ({ id, product: 'team', status: 'open', labels: [], updatedAt: 1, ...over });

function queue() {
  const all = threads();
  const store = { shipped: () => {}, shipFailed: () => {}, readItem: (slug, id) => all[id] ?? null };
  return new ShipQueue({
    store,
    userDir,
    folderFor: (item) => repo.folders[item.id] ?? path.join(repo.tmp, 'no-such-folder', item.id),
    isLive: () => false,
    run: async () => ({ code: 0, out: 'ship: shipped abc1234.\n' }),
  });
}

async function landAShip(q, others) {
  const shipping = row('w-narrow', { labels: [SHIP_LABEL] });
  await q.ship({ item: shipping, product: products()[0], script: 'ship.mjs', cwd: repo.base }, products(), [shipping, ...others]);
}

describe('after a ship lands', () => {
  it('tells an open thread whose branch now conflicts with main, naming the files and the other thread', async () => {
    const q = queue();
    await landAShip(q, [row('w-mine')]);
    const note = q.takeEarlyConflict(row('w-mine'));
    expect(note).toContain('sidebar.css');
    expect(note).toContain('list.mjs');
    expect(note).toContain('Sidebar crowds the phone');
    expect(note).toContain('Resolve it keeping both changes where they fit.');
  });

  it('tells it once', async () => {
    const q = queue();
    await landAShip(q, [row('w-mine')]);
    expect(q.takeEarlyConflict(row('w-mine'))).toBeTruthy();
    expect(q.takeEarlyConflict(row('w-mine'))).toBeNull();
  });

  it('says nothing to a branch that still merges cleanly', async () => {
    const q = queue();
    await landAShip(q, [row('w-clean')]);
    expect(q.takeEarlyConflict(row('w-clean'))).toBeNull();
  });

  it('says nothing to a finished thread or one with no folder', async () => {
    const q = queue();
    await landAShip(q, [row('w-mine', { status: 'done' }), row('w-gone')]);
    expect(q.takeEarlyConflict(row('w-mine'))).toBeNull();
    expect(q.takeEarlyConflict(row('w-gone'))).toBeNull();
  });

  it('touches no task folder: the branch and its files are as they were', async () => {
    const folder = repo.folders['w-mine'];
    const before = [git(folder, 'rev-parse', 'HEAD'), git(folder, 'status', '--porcelain'), fs.readFileSync(path.join(folder, 'sidebar.css'), 'utf8')];
    await landAShip(queue(), [row('w-mine')]);
    expect([git(folder, 'rev-parse', 'HEAD'), git(folder, 'status', '--porcelain'), fs.readFileSync(path.join(folder, 'sidebar.css'), 'utf8')]).toEqual(before);
  });

  it('drops a note the branch has since resolved', async () => {
    const q = queue();
    await landAShip(q, [row('w-mine')]);
    const folder = repo.folders['w-mine'];
    git(folder, 'merge', '-q', '-X', 'ours', 'origin/main', '-m', 'Merge origin/main into agentbox/w-mine');
    await landAShip(q, [row('w-mine')]);
    expect(q.takeEarlyConflict(row('w-mine'))).toBeNull();
  });
});

describe('the next run of that thread', () => {
  function supervisor() {
    const product = { slug: 'team', dir: repo.tmp, repoPath: null };
    return new Supervisor(
      { home: '/nonexistent-home', storeRoot: repo.tmp, claudeBin: '/nonexistent/claude', maxConcurrentSessions: 1, authProfiles: ['default'] },
      { listItems: () => [], listProducts: () => [product], isDue: () => true, settleAnswer() {}, recordSessionResult() {} },
      '/nonexistent-app',
    );
  }
  const item = { id: 'w-mine', product: 'team', title: 'Wider sidebar', body: 'Make the sidebar wider.', status: 'open', updatedAt: 1 };

  it('is told, in its prompt, and the run after it is not', () => {
    const sup = supervisor();
    sup.shipQueue.earlyConflicts.set('team/w-mine', 'MAIN NOW CONFLICTS WITH THIS BRANCH');
    const product = { slug: 'team', dir: repo.tmp, repoPath: null };
    expect(sup.spawnPlan(item, product, { engine: 'claude' }).prompt).toContain('MAIN NOW CONFLICTS WITH THIS BRANCH');
    expect(sup.spawnPlan(item, product, { engine: 'claude' }).prompt).not.toContain('MAIN NOW CONFLICTS WITH THIS BRANCH');
  });

  it('is not told about another thread\'s conflict', () => {
    const sup = supervisor();
    sup.shipQueue.earlyConflicts.set('team/w-other', 'MAIN NOW CONFLICTS WITH THIS BRANCH');
    expect(sup.spawnPlan(item, { slug: 'team', dir: repo.tmp, repoPath: null }, { engine: 'claude' }).prompt).not.toContain('MAIN NOW CONFLICTS');
  });
});
