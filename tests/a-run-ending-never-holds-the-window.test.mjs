// A RUN ENDING NEVER HOLDS THE WINDOW.
//
// What broke (w-1b1a14000a, 2026-10-21): since the cloud, the spinning wheel
// came several times a day, often just after E. Two traces of the exit path
// found two things done on the main thread every time any run ended:
//
// - `changeFromRepo` (git diff, git ls-files, a read of every untracked file)
//   and a parse of the whole transcript, up to 160 MB, to save what the run
//   changed. E on a thread with a live session kills it, so E paid for it too.
// - The Claude harness looked for a transcript that was not at its slug path
//   in every folder of ~/.claude/projects, one existsSync each: 10,429 folders,
//   1.4 s, measured 2026-10-19 for the copy in main/agents.mjs. A cloud run's
//   transcript is in the cloud, so every cloud session missed, at its exit and
//   on each 15 s recovery pass while the slots were full.
//
// Replayed at that scale on a Linux machine (10,429 folders, a 120 MB
// transcript, this repository): the old exit held the main thread 890 ms and
// the freeze recorder named changeFromTranscript; the new one held it 1 ms,
// with an 18 ms worst pause while the git thread did the same work. A cloud
// run's transcript is now never looked for beyond its slug path, and any miss
// is not looked for again for ten minutes.
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gitJob } from '../main/git-change-offthread.mjs';
import { snapshotRepo } from '../main/git-change.mjs';
import { changePath, readChange } from '../main/code-change.mjs';
import { machineryPath } from '../main/store/home.mjs';
import { harnessFor } from '../main/harnesses.mjs';
import { findTranscript, transcriptSearch } from '../main/transcript-search.mjs';
import { Supervisor } from '../main/supervisor.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirs = [];
const tempDir = (prefix) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); dirs.push(d); return d; };
afterEach(() => { vi.restoreAllMocks(); while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true }); });

function aRepo() {
  const repo = tempDir('run-end-repo-');
  const git = (...a) => execFileSync('git', a, { cwd: repo, stdio: 'ignore' });
  git('init', '-q');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'before\n');
  git('add', '.');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'first');
  return repo;
}

describe('what a run changed', () => {
  it('is saved while the main thread keeps running', async () => {
    const repo = aRepo();
    const before = snapshotRepo(repo);
    fs.writeFileSync(path.join(repo, 'a.txt'), 'after\n');
    for (let i = 0; i < 200; i += 1) fs.writeFileSync(path.join(repo, `new-${i}.txt`), `line ${i}\n`.repeat(200));
    const docsDir = tempDir('run-end-docs-');

    let ticks = 0;
    const ticker = setInterval(() => { ticks += 1; }, 2);
    const wrote = await gitJob('saveRunChange', {
      repoBefore: before, transcript: null, change: null, docsDir, itemId: 'w-runend', roots: [repo], since: 0,
    });
    clearInterval(ticker);

    // Run on this thread, the whole job is one synchronous call and nothing
    // else gets a turn until it returns.
    expect(ticks).toBeGreaterThan(1);
    expect(wrote).toBe(machineryPath(docsDir, changePath('w-runend')));
    expect(readChange(wrote).files.map((f) => f.path)).toContain('a.txt');
  });

  it('writes nothing for a run that changed nothing', async () => {
    const repo = aRepo();
    const docsDir = tempDir('run-end-docs-');
    const wrote = await gitJob('saveRunChange', {
      repoBefore: snapshotRepo(repo), transcript: null, change: null, docsDir, itemId: 'w-quiet', roots: [repo], since: 0,
    });
    expect(wrote).toBeNull();
  });

  it('is handed to the git thread by the exit, which reads no repository itself', () => {
    const src = fs.readFileSync(path.join(ROOT, 'main', 'supervisor.mjs'), 'utf8');
    const exit = src.slice(src.indexOf('const settleExit = (code, signal, how) => {'));
    const body = exit.slice(0, exit.indexOf('this.removeSpawnFiles(session);'));
    expect(body).toContain("gitJob('saveRunChange'");
    expect(body).not.toMatch(/changeFromRepo\(|writeChangeForRun\(/);
    expect(exit).toContain('this.endSession(item, session, product, { after: changed });');
  });
});

describe('the folder a finished run leaves', () => {
  // The read of what the run changed needs the folder, and a clean, merged
  // folder is deleted when the session lets go of it.
  function ending() {
    const released = [];
    const sup = { sessions: new Map(), _leftoverCleaner: null, releaseWorkFolder: (item) => { released.push(item.id); return 'released'; } };
    const item = { id: 'w-folder' };
    const session = {};
    sup.sessions.set(item.id, session);
    return { sup, item, session, released };
  }

  it('is not handed back until that read is done', async () => {
    const { sup, item, session, released } = ending();
    let done;
    const after = new Promise((resolve) => { done = resolve; });
    const out = Supervisor.prototype.endSession.call(sup, item, session, {}, { after });
    await new Promise((r) => setTimeout(r, 20));
    expect(sup.sessions.has(item.id)).toBe(false);
    expect(released).toEqual([]);
    done('wrote');
    expect(await out).toBe('released');
    expect(released).toEqual(['w-folder']);
  });

  it('is kept when another session started on the row while that read ran', async () => {
    for (const startAnother of [
      (sup, item) => sup.sessions.set(item.id, { another: true }),
      (sup, item) => { sup._preparing = new Map([[item.id, {}]]); },
    ]) {
      const { sup, item, session, released } = ending();
      let done;
      const after = new Promise((resolve) => { done = resolve; });
      const out = Supervisor.prototype.endSession.call(sup, item, session, {}, { after });
      startAnother(sup, item);
      done('wrote');
      expect(await out).toBeNull();
      expect(released).toEqual([]);
    }
  });

  it('is still handed back when that read fails', async () => {
    const { sup, item, session, released } = ending();
    await Supervisor.prototype.endSession.call(sup, item, session, {}, { after: Promise.reject(new Error('git broke')) });
    expect(released).toEqual(['w-folder']);
  });

  it('is handed back at once when there is nothing to wait for', () => {
    const { sup, item, session, released } = ending();
    Supervisor.prototype.endSession.call(sup, item, session, {});
    expect(released).toEqual(['w-folder']);
  });
});

describe('a Claude transcript that is not where the slug rule puts it', () => {
  function aHome(folders = 50) {
    const home = path.join(tempDir('transcript-home-'), '.claude');
    for (let i = 0; i < folders; i += 1) fs.mkdirSync(path.join(home, 'projects', `-p${i}`), { recursive: true });
    return home;
  }
  const claude = harnessFor('claude');
  const ask = (home, sessionId, cwd = '/somewhere/else', extra = {}) => claude.transcript({}, { sessionId, cwd, profile: home, ...extra });
  const listings = (spy, home) => spy.mock.calls.filter(([d]) => String(d) === path.join(home, 'projects')).length;

  it('of a cloud run is never looked for in every folder: it only comes home to its slug path', () => {
    const home = aHome();
    const listed = vi.spyOn(fs, 'readdirSync');
    const checked = vi.spyOn(fs, 'existsSync');
    for (let i = 0; i < 3; i += 1) expect(ask(home, 'cloud-session-1', '/somewhere/else', { cloud: true })).toBeNull();
    expect(listings(listed, home)).toBe(0);
    expect(checked.mock.calls.filter(([p]) => String(p).startsWith(`${path.join(home, 'projects')}${path.sep}-p`))).toHaveLength(0);
  });

  it('of a cloud run is found once it has come home', () => {
    const home = aHome(0);
    const cwd = '/work/task-folder';
    const dir = path.join(home, 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'home-now.jsonl'), '{}\n');
    expect(ask(home, 'home-now', cwd, { cloud: true })).toBe(path.join(dir, 'home-now.jsonl'));
  });

  it('of a thread run here or brought in is found by the same call, because a resume turns on it', () => {
    const home = aHome();
    const file = path.join(home, 'projects', '-p31', 'imported-session.jsonl');
    fs.writeFileSync(file, '{}\n');
    expect(ask(home, 'imported-session')).toBe(file);
  });

  it('found nowhere, is not looked for again for ten minutes', () => {
    const home = aHome();
    const listed = vi.spyOn(fs, 'readdirSync');
    for (let i = 0; i < 6; i += 1) expect(ask(home, 'nowhere')).toBeNull();
    expect(listings(listed, home)).toBe(1);
  });

  it('for the outside agents\' cards, is looked for in the background', async () => {
    const home = aHome();
    const projects = path.join(home, 'projects');
    fs.writeFileSync(path.join(projects, '-p7', 'outside.jsonl'), '{}\n');
    const listed = vi.spyOn(fs, 'readdirSync');
    expect(findTranscript(projects, 'outside', '/elsewhere')).toBeNull();
    expect(listings(listed, home)).toBe(0);
    await transcriptSearch();
    expect(findTranscript(projects, 'outside', '/elsewhere')).toBe(path.join(projects, '-p7', 'outside.jsonl'));
  });

  it('where the slug rule puts it, is answered straight away', () => {
    const home = aHome(0);
    const cwd = '/work/here';
    const dir = path.join(home, 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'direct.jsonl'), '{}\n');
    expect(ask(home, 'direct', cwd)).toBe(path.join(dir, 'direct.jsonl'));
  });

  it('under the folder\'s resolved path, as Claude Code names it, is answered straight away', () => {
    const home = aHome(0);
    const real = tempDir('real-folder-');
    const link = path.join(tempDir('link-'), 'through-a-link');
    fs.symlinkSync(real, link);
    const dir = path.join(home, 'projects', fs.realpathSync(real).replace(/[^a-zA-Z0-9]/g, '-'));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'linked.jsonl'), '{}\n');
    expect(ask(home, 'linked', link)).toBe(path.join(dir, 'linked.jsonl'));
  });

  it('under one login is not answered from another login\'s folder', () => {
    const one = aHome(3);
    const two = aHome(3);
    fs.writeFileSync(path.join(two, 'projects', '-p1', 'theirs.jsonl'), '{}\n');
    expect(ask(two, 'theirs')).toBe(path.join(two, 'projects', '-p1', 'theirs.jsonl'));
    expect(ask(one, 'theirs')).toBeNull();
  });
});
