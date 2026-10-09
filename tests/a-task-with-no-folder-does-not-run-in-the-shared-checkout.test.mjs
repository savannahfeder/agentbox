// A TASK THAT COULD NOT GET A FOLDER DOES NOT RUN IN THE SHARED CHECKOUT.
//
// FOUND 2026-10-07 (w-5952e6de3e), reviewing with Codex why people call agent
// worktrees brittle. Isolation had an unconditional back door: three places in
// main/supervisor.mjs answered "the folder could not be made" with "then use
// the checkout the app is built from", and said so only to a console.
//
//   workFolderFor      `catch { console.warn('... is running in the shared
//                      checkout'); return base; }` -- and the same for a NULL
//                      result, which is what a repoPath that is not a
//                      repository returns.
//   _folderFirst       the same, on the folder thread, and then it went on to
//                      START THE WORKER in that checkout.
//   spawnWorker        resolved the cwd after the permission files were
//                      written, so a throw there leaked them.
//
// WHY A CONSOLE LINE IS NOT GOOD ENOUGH. main/git-change.mjs, in its own words:
// "In a checkout two agents share, a file the other one wrote inside this run's
// window is inside this run's window, and no reading of the disk can tell them
// apart." So the review card a person reads can carry another agent's edits,
// and the only notice they were given was printed into a terminal they do not
// have open. Running is not better than not running when the result is a card
// that lies.
//
// WHAT MUST BE TRUE INSTEAD: a row promised a folder either gets one or does
// not run, and the row itself says why, where they will see it.
//
// AND WHAT MUST NOT CHANGE: a project with no repository at all has always run
// in the product folder, on purpose. That is not a broken promise, it is the
// absence of one, and it stays exactly as it was.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { taskFolderPath } from '../main/task-folders.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { waitFor } from './waiting.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-folder-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  fs.writeFileSync(path.join(dir, 'app.txt'), 'one\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'first');
  return dir;
}

/**
 * The one reliable way to make a folder impossible: a FILE where the folder's
 * parent directory has to be. `mkdirSync` of `.claude/worktrees` then fails
 * with ENOTDIR, which is the same shape as the real failures (a full disk, an
 * unwritable path) without needing either of those.
 */
function foldersCannotBeMadeIn(dir) {
  fs.writeFileSync(path.join(dir, '.claude'), 'not a directory\n');
}

const said = [];

function supervisorOver(repoPath) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-folder-store-'));
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
      listItems: () => [],
      listProducts: () => [product],
      readItem: () => null,
      isDue: () => true,
      settleAnswer() {},
      recordSessionResult: (slug, id, patch) => said.push({ id, ...patch }),
    },
    '/nonexistent-app',
  );
  return { sup, product, dir };
}

describe('a row that cannot have its own folder', () => {
  let dir;
  const made = [];
  beforeEach(() => { dir = repo(); said.length = 0; });
  afterEach(() => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    while (made.length) { try { fs.rmSync(made.pop(), { recursive: true, force: true }); } catch {} }
  });

  // THE REPORTED CASE, on the synchronous path.
  it('is never handed the checkout instead', () => {
    const { sup, product, dir: store } = supervisorOver(dir);
    made.push(store);
    foldersCannotBeMadeIn(dir);

    expect(() => sup.workFolderFor({ id: 'w-nofolder', product: 'agentbox' }, product)).toThrow();
    // And emphatically not by returning the checkout quietly.
    let got = null;
    try { got = sup.workFolderFor({ id: 'w-nofolder', product: 'agentbox' }, product); } catch {}
    expect(got).not.toBe(dir);
    expect(got).not.toBe(fs.realpathSync(dir));
  });

  // THE NULL RESULT, which is a different route to the same place: a repoPath
  // that exists and is not a repository makes `restoreTaskFolder` answer null
  // rather than throw, and `made?.path ?? base` turned that into the checkout.
  it('is never handed a folder that is not a repository', () => {
    const notARepo = fs.mkdtempSync(path.join(os.tmpdir(), 'not-a-repo-'));
    made.push(notARepo);
    const { sup, product, dir: store } = supervisorOver(notARepo);
    made.push(store);

    expect(() => sup.workFolderFor({ id: 'w-notarepo', product: 'agentbox' }, product)).toThrow();
  });

  // THE CASE THAT MUST NOT MATCH. A project with no repository never promised
  // isolation, and has run in the product folder since before folders existed.
  it('does not stop a project with no repository running where it always has', () => {
    const { sup, product, dir: store } = supervisorOver(null);
    made.push(store);

    expect(sup.workFolderFor({ id: 'w-norepo', product: 'agentbox' }, product)).toBe(product.dir);
  });

  // AND A ROW THAT CAN HAVE ONE STILL GETS IT. Without this the whole file
  // could pass by refusing everybody.
  it('does not stop a row that can have a folder getting one', () => {
    const { sup, product, dir: store } = supervisorOver(dir);
    made.push(store);

    expect(sup.workFolderFor({ id: 'w-fine', product: 'agentbox' }, product))
      .toBe(taskFolderPath(dir, 'w-fine'));
  });

  // REMOTE CONTROL SKIPS BOTH GATES, so the refusal has to sit on the one line
  // every spawn passes through. It is resolved before the plan and before the
  // per-run permission files are written, which is also why a refusal no longer
  // leaks a pair of those every time it happens.
  it('starts no session for a remote-control spawn either, and says why', () => {
    const { sup, product, dir: store } = supervisorOver(dir);
    made.push(store);
    foldersCannotBeMadeIn(dir);

    sup.spawnWorker({ id: 'w-remote', product: 'agentbox' }, { remoteOnly: true });

    expect(sup.sessions.has('w-remote')).toBe(false);
    const told = said.find((s) => s.id === 'w-remote');
    expect(told?.result).toMatch(/folder/i);
  });
});

describe('a row whose folder failed on the folder thread', () => {
  let dir;
  const made = [];
  beforeEach(() => { dir = repo(); said.length = 0; });
  afterEach(() => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    while (made.length) { try { fs.rmSync(made.pop(), { recursive: true, force: true }); } catch {} }
  });

  function watched() {
    const { sup, product, dir: store } = supervisorOver(dir);
    made.push(store);
    const spawns = [];
    sup.spawnWorker = (item, opts) => spawns.push({ item, opts });
    const redelivered = [];
    sup.redeliverAnswer = (item, answer) => redelivered.push({ id: item.id, answer });
    return { sup, product, spawns, redelivered };
  }

  it('starts nothing, gives its slot back, and says why on the row', async () => {
    const { sup, product, spawns, redelivered } = watched();
    foldersCannotBeMadeIn(dir);
    const item = { id: 'w-async-nofolder', product: 'agentbox', answer: 'carry on' };

    expect(sup._folderFirst(item, product, 'claude', { continuation: true })).toBe(true);
    expect(sup._loadFor('claude')).toBe(1);

    await waitFor('the row to be told it could not have a folder',
      () => said.some((s) => s.id === 'w-async-nofolder'));

    // No worker, in any folder.
    expect(spawns.length).toBe(0);
    // The slot is back, or the fleet loses one for good every time this happens.
    expect(sup._loadFor('claude')).toBe(0);
    // Their words are not delivered by a worker that never started.
    expect(redelivered).toEqual([{ id: 'w-async-nofolder', answer: 'carry on' }]);
    // And the row stays open, saying what happened, in words about a folder.
    const told = said.find((s) => s.id === 'w-async-nofolder');
    expect(told.status).toBe('open');
    expect(told.result).toMatch(/folder/i);
  });

  // A ROW SOMEBODY FINISHED WITH IS NOT REOPENED BY NEWS THAT ARRIVES LATE.
  //
  // `recordSessionResult` writes `status: 'open'`, so saying this in the handler
  // that catches the failure -- before anything has asked whether this attempt is
  // still the current one -- would reopen a row that was stopped or closed while
  // the folder was being made. Codex found this reading the first version, where
  // the report was made one `.then` too early.
  // WAITED FOR, NOT SLEPT THROUGH. A fixed pause here can finish before the
  // failure has even come back, which would pass whatever the code did. Two rows
  // are started instead, both doomed, and the SECOND one being told is the signal
  // that the first one's failure has already been through the same queue and
  // been dropped.
  it('says nothing about a row that was stopped while its folder was being made', async () => {
    const { sup, product, spawns } = watched();
    foldersCannotBeMadeIn(dir);

    expect(sup._folderFirst({ id: 'w-stopped-first', product: 'agentbox' }, product, 'claude', {})).toBe(true);
    expect(sup._folderFirst({ id: 'w-told-second', product: 'agentbox' }, product, 'claude', {})).toBe(true);
    expect(sup.stopSession('w-stopped-first')).toBe(true);

    await waitFor('the row behind it to be told it could not have a folder',
      () => said.some((s) => s.id === 'w-told-second'));

    expect(said.map((s) => s.id)).toEqual(['w-told-second']);
    expect(spawns.length).toBe(0);
  });

  // SAID ONCE WHILE IT KEEPS FAILING, AND SAID AGAIN AFTER IT WORKS. A tick that
  // asks over and over is not news, so the row is not rewritten every time; but a
  // row that got a folder and later cannot is told again, or the second failure
  // is the silent one.
  it('says it once per run of failures, and again after one works', () => {
    const { sup } = watched();
    const item = { id: 'w-twice', product: 'agentbox' };

    sup._couldNotGetAFolder(item, Error('first time'));
    sup._couldNotGetAFolder(item, Error('and again'));
    expect(said.length).toBe(1);

    sup._gotAFolderAfterAll('w-twice');
    sup._couldNotGetAFolder(item, Error('after it had worked'));
    expect(said.length).toBe(2);
    expect(said[1].result).toMatch(/after it had worked/);
  });

  // AND A REPORT THAT COULD NOT BE WRITTEN IS NOT COUNTED AS SAID. Marking it
  // first would mean a store write that failed -- likeliest during exactly the
  // disk trouble that caused this -- silenced every later attempt too.
  it('does not count a report it could not write', () => {
    const { sup } = watched();
    const item = { id: 'w-unwritable', product: 'agentbox' };
    sup.store.recordSessionResult = () => { throw Error('the store is not writable'); };

    sup._couldNotGetAFolder(item, Error('no folder'));
    sup.store.recordSessionResult = (slug, id, patch) => said.push({ id, ...patch });
    sup._couldNotGetAFolder(item, Error('no folder'));

    expect(said.length).toBe(1);
  });

  it('still starts a row whose folder can be made', async () => {
    const { sup, product, spawns } = watched();
    const item = { id: 'w-async-fine', product: 'agentbox' };

    expect(sup._folderFirst(item, product, 'claude', {})).toBe(true);
    await waitFor('the folder to be made and the spawn to follow', () => spawns.length === 1);
    expect(fs.existsSync(taskFolderPath(dir, 'w-async-fine'))).toBe(true);
    expect(said.length).toBe(0);
  });
});
