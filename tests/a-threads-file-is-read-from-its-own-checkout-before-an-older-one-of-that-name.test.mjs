// A THREAD'S FILE IS READ FROM ITS OWN CHECKOUT BEFORE AN OLDER ONE OF THAT NAME.
//
// Dev: the changes.md card in the consolidation reply opened
// yesterday's copper-chip note. Measured from the code: the big view asked for
// "changes.md" with no thread, the agent had written it at
// group-bookings/changes.md in its own checkout, and the look through every
// checkout found yesterday's thread's changes.md at its checkout's top first.
// The big view now says which thread it reads for, and that thread's checkout
// is looked through before anything found by name elsewhere.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveArtifact } from '../main/artifact-path.mjs';

const TODAY = 'w-aaaa111111';
const YESTERDAY = 'w-bbbb222222';

describe('which changes.md a thread opens', () => {
  let root, dir, repo, products;
  const put = (rel, words = 'x', ageMs = 0) => {
    const file = path.join(repo, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, words);
    const t = new Date(Date.now() - ageMs);
    fs.utimesSync(file, t, t);
    return file;
  };
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'own-checkout-'));
    dir = path.join(root, 'store', 'team');
    repo = path.join(root, 'repo');
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(repo, { recursive: true });
    products = [{ slug: 'team', dir, repoPath: repo }];
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
  const open = (src, thread = null) => resolveArtifact({ src, product: 'team', products, accountRoot: path.join(root, 'store'), thread, fresh: true });

  it("opens the thread's own changes.md, deeper in its checkout, not yesterday's", async () => {
    put(`.claude/worktrees/${YESTERDAY}/changes.md`, 'copper chip', 86_400_000);
    const mine = put(`.claude/worktrees/${TODAY}/group-bookings/changes.md`, 'group bookings');
    expect((await open('changes.md', TODAY)).path).toBe(mine);
  });

  it("opens the thread's own even over one in the project folder found only by name", async () => {
    const theirs = path.join(dir, 'designs', YESTERDAY, 'changes.md');
    fs.mkdirSync(path.dirname(theirs), { recursive: true });
    fs.writeFileSync(theirs, 'copper chip');
    const mine = put(`.claude/worktrees/${TODAY}/group-bookings/changes.md`, 'group bookings');
    expect((await open('group-bookings/changes.md', TODAY)).path).toBe(mine);
  });

  it("yesterday's thread still opens its own", async () => {
    const old = put(`.claude/worktrees/${YESTERDAY}/changes.md`, 'copper chip', 86_400_000);
    put(`.claude/worktrees/${TODAY}/group-bookings/changes.md`, 'group bookings');
    expect((await open('changes.md', YESTERDAY)).path).toBe(old);
  });

  it('a path said in full is still taken at its word', async () => {
    const old = put(`.claude/worktrees/${YESTERDAY}/changes.md`, 'copper chip');
    put(`.claude/worktrees/${TODAY}/changes.md`, 'group bookings');
    expect((await open(old, TODAY)).path).toBe(old);
  });

  it('found by name, a file in the folder the path names wins over one of that name elsewhere', async () => {
    put('notes/changes.md', 'other', 0);
    const named = put('apps/group-bookings/changes.md', 'group bookings', 60_000);
    expect((await open('group-bookings/changes.md')).path).toBe(named);
  });

  it('a thread with no file of that name finds nothing in its checkout and goes on as before', async () => {
    const elsewhere = put('docs/readme-notes.md', 'x');
    fs.mkdirSync(path.join(repo, '.claude/worktrees', TODAY), { recursive: true });
    expect((await open('readme-notes.md', TODAY)).path).toBe(elsewhere);
  });
});

describe('the big view says which thread it reads for', () => {
  const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
  it('read-doc passes the thread to the finder', () => {
    const ipc = read('main/ipc.mjs');
    const at = ipc.indexOf("ipcMain.handle('zero:read-doc'");
    expect(ipc.slice(at, at + 400)).toMatch(/thread: typeof thread === 'string'/);
  });
  it("a thread's big view hands its id to the stage", () => {
    expect(read('renderer/src/components/ThreadArtifacts.tsx')).toMatch(/thread=\{item\.id\}/);
    expect(read('renderer/src/components/ArtifactStage.tsx')).toMatch(/api\.resolveDoc\(\{ product, src: path, thread \}\)/);
  });
});
