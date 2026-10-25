// A SHIP THAT HITS A MERGE CONFLICT SAYS WHAT THE OTHER SIDE WAS FOR.
//
// When main/ship-queue.mjs ran the ship script and the merge of main
// conflicted, the thread got the script's words and nothing else: the
// conflicting files, but not what the work on main was for or which thread
// made it. Threads could not resolve it on their own, so the conflict went to
// the person to sort out. Measured by building a real conflict in a throwaway
// repository, running the real scripts/ship.mjs against it, and reading the
// reply: before this it named the files and no thread, no commit, no purpose.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ShipQueue, SHIP_LABEL } from '../main/ship-queue.mjs';
import { conflictingBranches, threads as someThreads } from './helpers/conflicting-branches.mjs';

const SHIP_SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'ship.mjs');

let repo; let userDir; let threads;
beforeEach(() => {
  repo = conflictingBranches();
  userDir = path.join(repo.tmp, 'user');
  fs.mkdirSync(userDir);
  threads = someThreads();
});
afterEach(() => repo.cleanUp());

const item = { id: 'w-mine', product: 'team', labels: [SHIP_LABEL], updatedAt: 1 };

async function shipAndReadTheReply(run) {
  const handed = [];
  const store = {
    shipped: () => {},
    shipFailed: () => {},
    readItem: (slug, id) => (slug === 'team' ? threads[id] ?? null : null),
  };
  const task = repo.folders['w-mine'];
  const q = new ShipQueue({ store, userDir, folderFor: () => task, isLive: () => false, handBack: (_, reply) => handed.push(reply), ...(run ? { run } : {}) });
  await q.ship({ item, product: { slug: 'team', repoPath: repo.base }, script: SHIP_SCRIPT, cwd: task });
  expect(handed).toHaveLength(1);
  return handed[0];
}

describe('a ship that fails on a merge conflict', () => {
  it('names the files, the thread that changed them on main, what it was for, and its commit', async () => {
    const reply = await shipAndReadTheReply();
    expect(reply).toContain('CONFLICT');
    expect(reply).toContain('sidebar.css');
    expect(reply).toContain('list.mjs');
    expect(reply).toContain('Sidebar crowds the phone');
    expect(reply).toContain('w-narrow');
    expect(reply).toContain('Narrowed the sidebar to 160px below 600px wide.');
    expect(reply).toContain('Narrow the sidebar on small screens');
  });

  it('lists a commit no thread made by its own subject', async () => {
    const reply = await shipAndReadTheReply();
    expect(reply).toContain('Fewer rows by hand');
  });

  it('leaves out work on main that touched none of the conflicting files', async () => {
    const reply = await shipAndReadTheReply();
    expect(reply).not.toContain('Readme greeting');
    expect(reply).not.toContain('w-unrelated');
    expect(reply).not.toContain('Say hello properly');
  });

  it('tells the thread to keep both changes and when to ask the person', async () => {
    const reply = await shipAndReadTheReply();
    expect(reply).toContain('Resolve it keeping both changes where they fit. Only ask the person if the two changes want opposite things, and then say which you kept and why.');
  });

  it('names a thread the store no longer has by its id alone', async () => {
    delete threads['w-narrow'];
    const reply = await shipAndReadTheReply();
    expect(reply).toContain('w-narrow');
    expect(reply).toContain('Narrow the sidebar on small screens');
  });
});

describe('a ship that fails for any other reason', () => {
  it('carries no conflict brief', async () => {
    const reply = await shipAndReadTheReply(async () => ({ code: 1, out: 'FAIL  tests/x.test.mjs > it works\nTests  1 failed | 3 passed (4)\n' }));
    expect(reply).toContain('FAIL  tests/x.test.mjs');
    expect(reply).not.toContain('Resolve it keeping both changes');
    expect(reply).not.toContain('Sidebar crowds the phone');
  });
});
