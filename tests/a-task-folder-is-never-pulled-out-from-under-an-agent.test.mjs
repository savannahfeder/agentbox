// A TASK'S FOLDER IS NEVER PULLED OUT FROM UNDER THE AGENT STANDING IN IT.
//
// WHAT WAS REPORTED, 2026-09-30, on the Astral Video row w-4d722ecf92. The
// worker's folder opened only partly filled in. About a minute later it was
// deleted outright while the agent was still running. A second session was
// started on the same row while the first still held it, and its claim came
// back refused. The run ended with no mockup and nothing committed.
//
// ONE CAUSE UNDER ALL THREE OF THOSE, and it is a matter of ordering rather
// than of locking. Making a folder is `git worktree add` plus a block clone of
// the checkout. Until now it was built AT THE PATH A SESSION RUNS IN, so for the
// whole of that a directory existed there, registered with git and holding
// almost none of the code.
//
// MEASURED ON astral-video ITSELF, 2026-10-01, which is the repository this
// happened in: the build takes 115 seconds now that the checkout is 14 GB, and
// the path a session runs in appeared 2.7 seconds in. 112 seconds of a folder
// that looked ready and was not, against a supervisor tick of fifteen seconds.
// Seven ticks could read it, so this was not bad luck.
//
// Everything that asks "is this row's folder there yet" asks the disk, so for
// those 112 seconds every one of them got the wrong answer:
//
//   `_folderFirst` reads `fs.existsSync(folder)` to decide whether a spawn has
//   to wait. A dir that exists reads as a folder that is ready, so the next
//   tick, fifteen seconds later, started a REAL session in a half-written
//   folder. The build then finished and started its own session on the same
//   row, which is the second worker whose claim was refused.
//
//   Two sessions on one row share one entry in the supervisor's session map, so
//   the first one to exit deleted the entry belonging to the one still running,
//   and then handed its folder back. A folder freshly made at main is clean and
//   already merged, which is exactly the case `releaseTaskFolder` deletes. That
//   is the deletion, about a minute in, with the agent still working in it.
//
//   `cloneCheckout` checks its own work and throws the folder away if it does
//   not match the commit. A session writing files in there while it copied is
//   enough to fail that check, and the rollback was a `worktree remove --force`
//   of the path the session was standing in.
//
// So the folder is built at `.claude/worktrees/.building-<id>` and MOVED into
// place once it is finished and verified. A directory at the real path now
// means a folder that is complete, which makes every existing check correct
// without any of them learning a new question, and leaves the rollback nothing
// to delete but its own staging. A task name can never start with a dot
// (`SAFE_NAME`), so staging can never collide with a real one.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureTaskFolder, buildingFolderPath, taskFolderPath, listTaskFolders } from '../main/task-folders.mjs';
import { Supervisor } from '../main/supervisor.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

function repo() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'folder-race-')));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  fs.writeFileSync(path.join(dir, 'app.txt'), 'one\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'first');
  return dir;
}

/**
 * A PROBE THAT RUNS INSIDE THE BUILD, so this tests the real window rather than
 * a reconstruction of it. `git worktree add` runs the repository's own
 * post-checkout hook in the new worktree before it returns, with the new
 * worktree as its working directory. So a hook that reports its own `pwd`, and
 * whether the real folder is on disk yet, answers the only question that
 * matters: what could a spawn have seen while the folder was still being made.
 */
function probeDuringTheBuild(dir, id) {
  const out = path.join(dir, 'probe.txt');
  const hooks = path.join(git(dir, 'rev-parse', '--absolute-git-dir'), 'hooks');
  fs.mkdirSync(hooks, { recursive: true });
  const hook = path.join(hooks, 'post-checkout');
  fs.writeFileSync(hook, [
    '#!/bin/sh',
    `echo "building in $(basename "$(pwd)")" >> ${JSON.stringify(out)}`,
    `if [ -e ${JSON.stringify(taskFolderPath(dir, id))} ]; then echo "the real folder is there" >> ${JSON.stringify(out)}; else echo "the real folder is not there yet" >> ${JSON.stringify(out)}; fi`,
    '',
  ].join('\n'));
  fs.chmodSync(hook, 0o755);
  return () => (fs.existsSync(out) ? fs.readFileSync(out, 'utf8').trim().split('\n').filter(Boolean) : []);
}

describe('a folder being made is not a folder a session may run in', () => {
  let dir;
  beforeEach(() => { dir = repo(); });
  afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

  // THE ONE SHE REPORTED. Mid-build, nothing may exist at the path a session
  // would be given, because a directory there is read as a folder that is ready.
  it('builds somewhere else entirely, so nothing half made is ever at the path a session runs in', () => {
    // Dirty beside it, so the ordinary checkout runs and the hook fires.
    fs.writeFileSync(path.join(dir, 'app.txt'), 'somebody is mid-edit\n');
    const seen = probeDuringTheBuild(dir, 'w-4d722ecf92');

    const made = ensureTaskFolder(dir, 'w-4d722ecf92');

    const duringTheBuild = seen();
    expect(duringTheBuild).toContain('building in .building-w-4d722ecf92');
    expect(duringTheBuild).toContain('the real folder is not there yet');
    expect(duringTheBuild).not.toContain('the real folder is there');
    // And once it is finished it is exactly where it has always been.
    expect(made.path).toBe(taskFolderPath(dir, 'w-4d722ecf92'));
    expect(fs.existsSync(made.path)).toBe(true);
    expect(git(made.path, 'status', '--porcelain')).toBe('');
    expect(fs.readFileSync(path.join(made.path, 'app.txt'), 'utf8')).toBe('one\n');
  });

  // The fast path takes the same route. It is the one her Mac actually uses,
  // and it is the one whose rollback deleted a folder a session stood in.
  it('leaves no staging behind, on either way of making it', () => {
    const made = ensureTaskFolder(dir, 'w-clone');
    expect(fs.existsSync(buildingFolderPath(dir, 'w-clone'))).toBe(false);
    expect(git(made.path, 'status', '--porcelain')).toBe('');
    expect(git(dir, 'worktree', 'list', '--porcelain')).not.toContain('.building-');
  });

  // THE BOUNDARY ON THE OTHER SIDE: the app died mid-build, so staging is still
  // on disk and still registered. It holds nothing anybody wants and it must
  // not stop the next attempt.
  it('clears a build that died half way and makes the folder anyway', () => {
    const staging = buildingFolderPath(dir, 'w-died');
    fs.mkdirSync(path.dirname(staging), { recursive: true });
    git(dir, 'worktree', 'add', '--no-checkout', '-q', staging, '-b', 'agentbox/w-died', 'refs/heads/main');
    fs.writeFileSync(path.join(staging, 'half-written.txt'), 'nobody wants this\n');

    const made = ensureTaskFolder(dir, 'w-died');
    expect(made.path).toBe(taskFolderPath(dir, 'w-died'));
    expect(git(made.path, 'status', '--porcelain')).toBe('');
    expect(fs.existsSync(staging)).toBe(false);
    expect(fs.existsSync(path.join(made.path, 'half-written.txt'))).toBe(false);
  });

  // THE CASE THAT MUST NOT MATCH. Staging is not a task folder, so it must
  // never reach the list she is shown or the sweep that parks them.
  it('never shows a staging folder as one of her task folders', () => {
    const staging = buildingFolderPath(dir, 'w-mid');
    fs.mkdirSync(path.dirname(staging), { recursive: true });
    git(dir, 'worktree', 'add', '--no-checkout', '-q', staging, '-b', 'agentbox/w-mid', 'refs/heads/main');
    ensureTaskFolder(dir, 'w-real');

    expect(listTaskFolders(dir).map((f) => f.id)).toEqual(['w-real']);
  });
});

/* ============== and the two sessions that ended up on one row ============= */

function supervisorOver(repoPath, rows = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'folder-race-sup-'));
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

describe('two sessions never end up on one row', () => {
  let dir;
  const stores = [];
  beforeEach(() => { dir = repo(); });
  afterEach(() => {
    for (const s of stores.splice(0)) { try { fs.rmSync(s, { recursive: true, force: true }); } catch {} }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  });

  // THE SECOND WORKER, whose claim came back refused. A spawn while the row's
  // folder is being prepared has to wait for it, and the question it was asking
  // was the disk rather than whether anybody was already preparing one.
  it('makes a spawn wait while the row is already having its folder made', () => {
    const { sup, product, dir: store } = supervisorOver(dir, [{ id: 'w-4d722ecf92', product: 'agentbox', status: 'open' }]);
    stores.push(store);
    const item = { id: 'w-4d722ecf92', product: 'agentbox', status: 'open' };

    // Exactly the state ten seconds into a build: this row is being prepared,
    // and there is a directory at its path.
    sup._preparing = new Map([[item.id, { item, opts: {}, engine: 'claude' }]]);
    fs.mkdirSync(taskFolderPath(dir, item.id), { recursive: true });

    expect(sup._folderFirst(item, product, 'claude', {})).toBe(true);
  });

  // THE CASE THAT MUST NOT MATCH: a finished folder and nobody preparing one.
  // That spawn runs now, and making it wait would be a row that never answers.
  it('does not make a spawn wait when the folder is finished', () => {
    const { sup, product, dir: store } = supervisorOver(dir, [{ id: 'w-ready', product: 'agentbox', status: 'open' }]);
    stores.push(store);
    ensureTaskFolder(dir, 'w-ready');

    expect(sup._folderFirst({ id: 'w-ready', product: 'agentbox' }, product, 'claude', {})).toBe(false);
  });

  // The other end of the same race: the folder is finished and the spawn that
  // was waiting for it goes to start, but somebody else got on the row while it
  // was being built. There is nothing left for this spawn to do.
  it('does not start the spawn it was holding if a session got on the row meanwhile', async () => {
    const item = { id: 'w-overtaken', product: 'agentbox', status: 'open' };
    const { sup, product, dir: store } = supervisorOver(dir, [item]);
    stores.push(store);
    let started = 0;
    sup.spawnWorker = () => { started += 1; };

    expect(sup._folderFirst(item, product, 'claude', {})).toBe(true);
    sup.sessions.set(item.id, { itemId: item.id, startedAt: 1 });
    // Let the folder finish being made, which is when the held spawn goes.
    while (sup._preparing.has(item.id)) await new Promise((r) => setTimeout(r, 50));

    expect(started).toBe(0);
  }, 30_000);

  // THE FIRST THING THE BUG REPORT ASKED FOR: whatever cleans folders up must
  // never remove one whose row is claimed by a live session. A closed row with a
  // claim still on it is a worker that has not finished putting its work away.
  it('never parks a finished row whose claim is still live', async () => {
    const made = ensureTaskFolder(dir, 'w-still-claimed');
    const { sup, product, dir: store } = supervisorOver(dir, [
      { id: 'w-still-claimed', product: 'agentbox', status: 'done', claim: { holder: 'mcp-44243' }, claimExpired: false },
    ]);
    stores.push(store);

    expect(await sup.parkClosedFolders(product)).toBe(0);
    expect(fs.existsSync(made.path)).toBe(true);
  }, 30_000);

  // THE CASE THAT MUST NOT MATCH: the same row once the claim has run out. The
  // folder is then nobody's and parking it is the whole point of the sweep.
  it('parks a finished row whose claim has run out', async () => {
    const made = ensureTaskFolder(dir, 'w-claim-expired');
    const { sup, product, dir: store } = supervisorOver(dir, [
      { id: 'w-claim-expired', product: 'agentbox', status: 'done', claim: { holder: 'mcp-44243' }, claimExpired: true },
    ]);
    stores.push(store);

    expect(await sup.parkClosedFolders(product)).toBe(1);
    expect(fs.existsSync(made.path)).toBe(false);
  }, 30_000);

  // AND THE DELETION ITSELF. Whatever put two sessions on one row, the one that
  // exits first must not forget the one still running, and must not hand back a
  // folder that session is standing in. A folder made at main is clean and
  // already merged, which is the one case that gets deleted rather than kept.
  it('does not hand back the folder when another session is now on the row', async () => {
    const made = ensureTaskFolder(dir, 'w-two-sessions');
    const item = { id: 'w-two-sessions', product: 'agentbox', status: 'open' };
    const { sup, product, dir: store } = supervisorOver(dir, [item]);
    stores.push(store);

    const first = { itemId: item.id, startedAt: 1 };
    const second = { itemId: item.id, startedAt: 2 };
    sup.sessions.set(item.id, second);

    await sup.endSession(item, first, product);

    expect(sup.sessions.get(item.id)).toBe(second);
    expect(fs.existsSync(made.path)).toBe(true);
  });

  // And the ordinary exit, which is the case that must still work: the session
  // on the row is this one, so the row is forgotten and the folder goes back.
  // Two git jobs on the folder thread, which has to start up first, so this one
  // is given room rather than raced.
  it('still hands the folder back when the session that exits is the one on the row', { timeout: 30_000 }, async () => {
    const made = ensureTaskFolder(dir, 'w-only-session');
    const item = { id: 'w-only-session', product: 'agentbox', status: 'open' };
    const { sup, product, dir: store } = supervisorOver(dir, [item]);
    stores.push(store);

    const only = { itemId: item.id, startedAt: 1 };
    sup.sessions.set(item.id, only);

    await sup.endSession(item, only, product);

    expect(sup.sessions.has(item.id)).toBe(false);
    expect(fs.existsSync(made.path)).toBe(false);
  });
});
