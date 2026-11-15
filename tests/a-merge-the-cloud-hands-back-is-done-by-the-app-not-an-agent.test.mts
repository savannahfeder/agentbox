// A MERGE THE CLOUD HANDS BACK IS DONE BY THE APP, NOT AN AGENT.
//
// In the cloud power test of 2026-11-03, every "Ship it" on a cloud thread
// ended with the cloud run's `AGENTBOX-NEEDS-THE-COMPUTER: merging into main`,
// and the app answered each one by starting a whole agent on the Mac to run a
// git merge. About 50 runs handed back to merge; 5 needed anything else. A
// local agent took about 470 MB and up to 1.2 GB, against 5 to 8 MB for a
// cloud agent at work, so finishing threads was most of what the cloud still
// cost the Mac.
//
// Now the app merges the thread's branch into main itself when that is all the
// hand-back asks, without blocking its own process, and pushes main when it is
// published elsewhere, as on GitHub. The old hand-back (a run on this
// computer) happens only when that is not plain: a conflict, uncommitted
// changes, the project's folder off main, a main here holding commits the
// published copy lacks, a published copy out of reach, or a push refused.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { isPlainMerge, mergeHome, mergedSentence } from '../main/cloud/merge-home.mts';
import { Supervisor } from '../main/supervisor.mts';
import { HAND_BACK } from '../shared/cloud-hand-back.mts';

const dirs = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-home-')); dirs.push(d); return d; };
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true }); });

const git = (cwd, ...args) => execFileSync('git', ['-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const write = (cwd, file, text) => fs.writeFileSync(path.join(cwd, file), text);
const commit = (cwd, file, text, msg) => { write(cwd, file, text); git(cwd, 'add', '.'); git(cwd, 'commit', '-qm', msg); };

/** A project's own checkout on main, and a thread's folder on a branch of its own. */
function project() {
  const root = tmp();
  const base = path.join(root, 'repo');
  fs.mkdirSync(base);
  git(base, 'init', '-q', '-b', 'main');
  git(base, 'config', 'user.email', 'tester@example.com');
  git(base, 'config', 'user.name', 'Tester');
  git(base, 'config', 'commit.gpgsign', 'false');
  commit(base, 'a.txt', 'one\n', 'first');
  const folder = path.join(root, 'task');
  git(base, 'worktree', 'add', '-q', '-b', 'agentbox/w-a', folder);
  return { root, base, folder, head: () => git(base, 'rev-parse', 'HEAD'), onMain: (sha) => git(base, 'merge-base', '--is-ancestor', sha, 'main') === '' };
}

describe('which hand-backs are a plain merge', () => {
  it('the line the cloud is told to write, in any case', () => {
    expect(isPlainMerge('merging into main')).toBe(true);
    expect(isPlainMerge('Merging into main')).toBe(true);
  });

  it('not a merge that asks for something more, and not anything else', () => {
    expect(isPlainMerge("merging into main, with the today's count that's still landing there")).toBe(false);
    expect(isPlainMerge('merging main, which has the real-time sort fix')).toBe(false);
    expect(isPlainMerge('your AWS sign-in')).toBe(false);
    expect(isPlainMerge(null)).toBe(false);
  });
});

describe('the app merges a finished thread into main', () => {
  it('a thread\'s commits land on main and both folders are left clean', async () => {
    const p = project();
    commit(p.folder, 'b.txt', 'two\n', 'add b');
    commit(p.folder, 'c.txt', 'three\n', 'add c');
    const tip = git(p.folder, 'rev-parse', 'HEAD');
    const merged = await mergeHome(p.folder);
    expect(merged).toMatchObject({ ok: true, commits: 2, into: 'main' });
    expect(p.onMain(tip)).toBe(true);
    expect(git(p.base, 'status', '--porcelain')).toBe('');
    expect(mergedSentence(merged)).toMatch(/^\*\*Merged into main\.\*\* The 2 commits this thread made are on main now/);
  });

  it('main that moved since the thread began gets a merge commit', async () => {
    const p = project();
    commit(p.base, 'other.txt', 'other\n', 'another thread');
    commit(p.folder, 'b.txt', 'two\n', 'add b');
    expect(await mergeHome(p.folder)).toMatchObject({ ok: true, commits: 1 });
    expect(git(p.base, 'log', '-1', '--format=%P').split(' ')).toHaveLength(2);
  });

  it('a branch already on main merges nothing and says so', async () => {
    const p = project();
    const merged = await mergeHome(p.folder);
    expect(merged).toMatchObject({ ok: true, commits: 0 });
    expect(mergedSentence(merged)).toMatch(/^\*\*Already on main\.\*\*/);
  });

  it('two threads merging at once go one after the other', async () => {
    const p = project();
    commit(p.folder, 'b.txt', 'two\n', 'add b');
    const second = path.join(p.root, 'task2');
    git(p.base, 'worktree', 'add', '-q', '-b', 'agentbox/w-b', second);
    commit(second, 'c.txt', 'three\n', 'add c');
    const [one, two] = await Promise.all([mergeHome(p.folder), mergeHome(second)]);
    expect(one.ok && two.ok).toBe(true);
    expect(p.onMain(git(p.folder, 'rev-parse', 'HEAD')) && p.onMain(git(second, 'rev-parse', 'HEAD'))).toBe(true);
  });
});

describe('anything but a plain merge is left to an agent, with main untouched', () => {
  it('a conflict: the merge is taken back and the reason kept', async () => {
    const p = project();
    commit(p.base, 'a.txt', 'main says\n', 'main edit');
    commit(p.folder, 'a.txt', 'thread says\n', 'thread edit');
    const before = p.head();
    const merged = await mergeHome(p.folder);
    expect(merged.ok).toBe(false);
    expect(merged.why).toMatch(/conflict/);
    expect(merged.said).toMatch(/a\.txt/);
    expect(p.head()).toBe(before);
    expect(git(p.base, 'status', '--porcelain')).toBe('');
    expect(fs.existsSync(path.join(p.base, '.git', 'MERGE_HEAD'))).toBe(false);
  });

  it('uncommitted changes in either folder, or the project\'s folder off main', async () => {
    const p = project();
    commit(p.folder, 'b.txt', 'two\n', 'add b');
    write(p.folder, 'loose.txt', 'not committed\n');
    expect((await mergeHome(p.folder)).ok).toBe(false);
    fs.rmSync(path.join(p.folder, 'loose.txt'));
    write(p.base, 'loose.txt', 'not committed\n');
    expect((await mergeHome(p.folder)).ok).toBe(false);
    fs.rmSync(path.join(p.base, 'loose.txt'));
    git(p.base, 'switch', '-q', '-c', 'elsewhere');
    expect(await mergeHome(p.folder)).toMatchObject({ ok: false, why: expect.stringMatching(/elsewhere/) });
  });

  it('a thread working in the project\'s own folder, not a folder of its own', async () => {
    const p = project();
    expect((await mergeHome(p.base)).ok).toBe(false);
  });
});

/** The same project with its main published to a copy elsewhere, as on GitHub. */
function published() {
  const p = project();
  const remote = path.join(p.root, 'remote.git');
  git(p.root, 'init', '-q', '--bare', '-b', 'main', remote);
  git(p.base, 'remote', 'add', 'origin', remote);
  git(p.base, 'push', '-q', '-u', 'origin', 'main');
  const remoteMain = () => git(remote, 'rev-parse', 'main');
  /** Someone else's push to the published main. */
  const pushedElsewhere = () => {
    const other = path.join(p.root, 'other');
    git(p.root, 'clone', '-q', remote, other);
    git(other, 'config', 'user.email', 'other@example.com');
    git(other, 'config', 'user.name', 'Other');
    commit(other, 'other.txt', 'theirs\n', 'their change');
    git(other, 'push', '-q', 'origin', 'main');
  };
  return { ...p, remote, remoteMain, pushedElsewhere };
}

describe('a main published elsewhere is merged here and pushed', () => {
  it('the thread\'s commits reach the published main', async () => {
    const p = published();
    commit(p.folder, 'b.txt', 'two\n', 'add b');
    const tip = git(p.folder, 'rev-parse', 'HEAD');
    const merged = await mergeHome(p.folder);
    expect(merged).toMatchObject({ ok: true, commits: 1, into: 'main', pushedTo: 'origin' });
    expect(p.remoteMain()).toBe(p.head());
    expect(p.onMain(tip)).toBe(true);
    expect(mergedSentence(merged)).toMatch(/^\*\*Merged into main and pushed\.\*\* The commit this thread made is on main here and on origin now/);
  });

  it('a published main that moved on is brought up to date here first', async () => {
    const p = published();
    p.pushedElsewhere();
    commit(p.folder, 'b.txt', 'two\n', 'add b');
    expect(await mergeHome(p.folder)).toMatchObject({ ok: true, pushedTo: 'origin' });
    expect(git(p.base, 'show', 'main:other.txt')).toBe('theirs');
    expect(p.remoteMain()).toBe(p.head());
  });

  it('takes a turn at the memory check for the push alone, and gives it back', async () => {
    const p = published();
    commit(p.folder, 'b.txt', 'two\n', 'add b');
    const turns = [];
    await mergeHome(p.folder, { beforePush: async () => { turns.push('taken'); return () => turns.push('given back'); } });
    expect(turns).toEqual(['taken', 'given back']);
    const local = project();
    commit(local.folder, 'b.txt', 'two\n', 'add b');
    const none = [];
    await mergeHome(local.folder, { beforePush: async () => { none.push('taken'); return () => {}; } });
    expect(none).toEqual([]);
  });
});

describe('a published main is left to an agent when pushing is not plain', () => {
  it('main here holds commits the published copy does not have: nothing is merged or pushed', async () => {
    const p = published();
    commit(p.base, 'mine.txt', 'not pushed yet\n', 'local only');
    commit(p.folder, 'b.txt', 'two\n', 'add b');
    const before = p.head();
    const remoteBefore = p.remoteMain();
    expect(await mergeHome(p.folder)).toMatchObject({ ok: false, why: expect.stringMatching(/not on origin/) });
    expect(p.head()).toBe(before);
    expect(p.remoteMain()).toBe(remoteBefore);
  });

  it('the published copy cannot be reached: nothing is merged', async () => {
    const p = published();
    commit(p.folder, 'b.txt', 'two\n', 'add b');
    const before = p.head();
    fs.rmSync(p.remote, { recursive: true, force: true });
    expect(await mergeHome(p.folder)).toMatchObject({ ok: false, why: expect.stringMatching(/could not reach origin/) });
    expect(p.head()).toBe(before);
  });

  it('a push that is refused: the merge stays here, and the agent is told what the push said', async () => {
    const p = published();
    commit(p.folder, 'b.txt', 'two\n', 'add b');
    const tip = git(p.folder, 'rev-parse', 'HEAD');
    const remoteBefore = p.remoteMain();
    fs.writeFileSync(path.join(p.remote, 'hooks', 'pre-receive'), '#!/bin/sh\necho "main is protected: open a pull request"\nexit 1\n', { mode: 0o755 });
    const turns = [];
    const merged = await mergeHome(p.folder, { beforePush: async () => () => turns.push('given back') });
    expect(merged).toMatchObject({ ok: false, merged: true, why: expect.stringMatching(/merged into main here, but pushing it to origin failed/) });
    expect(merged.said).toMatch(/main is protected/);
    expect(p.onMain(tip)).toBe(true);
    expect(p.remoteMain()).toBe(remoteBefore);
    expect(turns).toEqual(['given back']);
  });
});

describe('the supervisor, when a cloud run hands back', () => {
  const item = { id: 'w-a', product: 'p' };
  const handedBack = (what) => ({ itemId: 'w-a', product: 'p', cloud: true, startedAt: Date.now() - 60_000, sessionId: 's1', result: `${HAND_BACK} ${what}`, resultIsError: false });
  const make = (root, repoPath) => {
    const product = { slug: 'p', dir: root, repoPath };
    const row = { id: 'w-a', product: 'p', answer: 'Ship it', wrote: { answer: { ts: 5, source: 'founder' } } };
    const written = [];
    const settled = [];
    const store = {
      listItems: () => [], listProducts: () => [product], isDue: () => true,
      readItem: () => row,
      recordSessionResult: (slug, id, fields) => written.push({ slug, id, ...fields }),
      settleAnswer: (slug, id, ts) => settled.push({ slug, id, ts }),
    };
    const sup = new Supervisor({ storeRoot: root, home: root, maxConcurrentSessions: 3 }, store, root);
    return { sup, row, written, settled };
  };

  it('a plain merge is merged here: the merge is the answer and her reply is settled', async () => {
    const p = project();
    commit(p.folder, 'b.txt', 'two\n', 'add b');
    const { sup, row, written, settled } = make(p.root, p.base);
    expect(sup._noteCloudHandBack(item, handedBack('merging into main'), p.folder)).toBe(true);
    await sup._mergingHome.get(item.id);
    expect(written).toEqual([expect.objectContaining({ id: 'w-a', result: expect.stringMatching(/^\*\*Merged into main\.\*\*/), status: null })]);
    expect(settled).toEqual([{ slug: 'p', id: 'w-a', ts: 5 }]);
    expect(sup._handledAnswers.has(sup._answerKey(row))).toBe(true);
    expect(sup._movedHere(item.id)).toBe(false);
    expect(sup._mergingHome.has(item.id)).toBe(false);
  });

  it('a published main is merged and pushed, and the answer says so', async () => {
    const p = published();
    commit(p.folder, 'b.txt', 'two\n', 'add b');
    const { sup, written } = make(p.root, p.base);
    sup._noteCloudHandBack(item, handedBack('merging into main'), p.folder);
    await sup._mergingHome.get(item.id);
    expect(written).toEqual([expect.objectContaining({ result: expect.stringMatching(/^\*\*Merged into main and pushed\.\*\*.*on origin now/) })]);
    expect(p.remoteMain()).toBe(p.head());
    expect(sup._movedHere(item.id)).toBe(false);
  });

  it('a refused push moves to a run on this computer, told the merge is done and what the push said', async () => {
    const p = published();
    commit(p.folder, 'b.txt', 'two\n', 'add b');
    fs.writeFileSync(path.join(p.remote, 'hooks', 'pre-receive'), '#!/bin/sh\necho "main is protected"\nexit 1\n', { mode: 0o755 });
    const { sup, written } = make(p.root, p.base);
    sup._noteCloudHandBack(item, handedBack('merging into main'), p.folder);
    await sup._mergingHome.get(item.id);
    expect(written).toEqual([]);
    expect(sup._movedHere(item.id)).toBe(true);
    const note = sup._mergeHomeNote(item);
    expect(note).toMatch(/merged into main here, but pushing it to origin failed/);
    expect(note).toMatch(/main is protected/);
  });

  it('a reply she wrote after the run began is not settled by the merge, so a run still carries it', async () => {
    const p = project();
    commit(p.folder, 'b.txt', 'two\n', 'add b');
    const { sup, row, written, settled } = make(p.root, p.base);
    const session = handedBack('merging into main');
    row.answer = 'and also rename the button';
    row.wrote.answer.ts = session.startedAt + 1000;
    sup._noteCloudHandBack(item, session, p.folder);
    await sup._mergingHome.get(item.id);
    expect(written).toHaveLength(1);
    expect(settled).toEqual([]);
    expect(sup._handledAnswers.has(sup._answerKey(row))).toBe(false);
  });

  it('while git runs the thread does not start anywhere', () => {
    const p = project();
    commit(p.folder, 'b.txt', 'two\n', 'add b');
    const { sup } = make(p.root, p.base);
    sup._noteCloudHandBack(item, handedBack('merging into main'), p.folder);
    // Choosing the engine is the first thing a start does past its gates.
    let started = 0;
    sup._engineFor = () => { started += 1; return 'claude'; };
    expect(sup._mergingHome.has(item.id)).toBe(true);
    try { sup.spawnWorker(item); } catch { /* a start past the hold may fail on the bare test store */ }
    expect(started).toBe(0);
  });

  it('a merge that conflicts moves to a run on this computer, told why', async () => {
    const p = project();
    commit(p.base, 'a.txt', 'main says\n', 'main edit');
    commit(p.folder, 'a.txt', 'thread says\n', 'thread edit');
    const { sup, written } = make(p.root, p.base);
    expect(sup._noteCloudHandBack(item, handedBack('merging into main'), p.folder)).toBe(true);
    expect(sup._movedHere(item.id)).toBe(false);
    await sup._mergingHome.get(item.id);
    expect(sup._movedHere(item.id)).toBe(true);
    expect(written).toEqual([]);
    expect(sup._mergeHomeNote(item)).toMatch(/conflict/);
    expect(sup._mergeHomeNote(item)).toBeNull();
  });

  it('a project that ships through the app keeps its own way to main', () => {
    const p = project();
    commit(p.folder, 'b.txt', 'two\n', 'add b');
    fs.writeFileSync(path.join(p.base, 'ship.sh'), '#!/bin/sh\n');
    fs.writeFileSync(path.join(p.root, 'ship.json'), JSON.stringify({ p: { script: 'ship.sh' } }));
    const { sup } = make(p.root, p.base);
    expect(sup._noteCloudHandBack(item, handedBack('merging into main'), p.folder)).toBe(true);
    expect(sup._mergingHome?.has(item.id) ?? false).toBe(false);
    expect(sup._movedHere(item.id)).toBe(true);
  });

  it('anything else moves here at once, with nothing merged', () => {
    const p = project();
    commit(p.folder, 'b.txt', 'two\n', 'add b');
    const before = p.head();
    const { sup } = make(p.root, p.base);
    expect(sup._noteCloudHandBack(item, handedBack('your AWS sign-in'), p.folder)).toBe(true);
    expect(sup._mergingHome?.has(item.id) ?? false).toBe(false);
    expect(sup._movedHere(item.id)).toBe(true);
    expect(p.head()).toBe(before);
    expect(sup._mergeHomeNote(item)).toBeNull();
  });
});
