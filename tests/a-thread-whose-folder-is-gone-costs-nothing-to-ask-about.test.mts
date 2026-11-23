// A thread whose folder is gone costs nothing to ask about.
//
// 2026-11-22: the app's own CPU record, 15 minutes after a restart with two
// agents running, put 45% of the main thread's busy time in finding files by
// name: 19% reading folders, 4% starting folder watches, 5% reading the list
// of files written elsewhere. Most threads asked about are finished and their
// folder was given back, yet each ask still tried to list that missing
// folder, tried to watch it (which throws), and read and parsed the 256 KB
// list again. A pass over every thread's files does this thousands of times.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveArtifact, stopWatchingFolders } from '../main/artifact-path.mts';
import { noteWrittenElsewhere, writtenFileNamed } from '../main/store/written-elsewhere.mts';

const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
let root = '', repo = '', dir = '';
let listed: string[] = [];
let watched: string[] = [];
const id = (n: number) => `w-${(0xabc000 + n).toString(16)}`;
const checkouts = () => path.join(repo, '.claude', 'worktrees');
const under = (list: string[], folder: string) => list.filter((f) => f === folder || f.startsWith(folder + path.sep)).length;
const ask = (src: string, thread: string | null, now: number, project = dir) => resolveArtifact({
  src, product: 'ours', products: [{ slug: 'ours', dir: project, repoPath: repo }], now, thread,
});

beforeAll(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'folder-gone-')));
  repo = path.join(root, 'repo');
  dir = path.join(root, 'docs');
  fs.mkdirSync(checkouts(), { recursive: true });
  fs.mkdirSync(dir);
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
beforeEach(() => {
  // The watch is only taken on a Mac; Node's recursive watch works here too.
  Object.defineProperty(process, 'platform', { value: 'darwin' });
  listed = []; watched = [];
  const readdir = fs.promises.readdir.bind(fs.promises);
  vi.spyOn(fs.promises, 'readdir').mockImplementation(((d: fs.PathLike, opts: unknown) => { listed.push(String(d)); return readdir(d, opts as never); }) as typeof fs.promises.readdir);
  const watch = fs.watch.bind(fs);
  vi.spyOn(fs, 'watch').mockImplementation(((d: fs.PathLike, ...rest: unknown[]) => { watched.push(String(d)); return (watch as (...a: unknown[]) => fs.FSWatcher)(d, ...rest); }) as typeof fs.watch);
});
afterEach(() => {
  Object.defineProperty(process, 'platform', platform);
  vi.restoreAllMocks();
  stopWatchingFolders();
});

describe('a name asked of a thread whose folder was given back', () => {
  it('neither lists nor watches the folder that is not there', async () => {
    for (let n = 0; n < 200; n++) expect((await ask('missing.png', id(n), 1_000_000)).ok).toBe(false);
    for (let n = 0; n < 200; n++) {
      expect(under(listed, path.join(checkouts(), id(n)))).toBe(0);
      expect(under(watched, path.join(checkouts(), id(n)))).toBe(0);
    }
  });

  it('still finds a file two folders down in a folder that is there', async () => {
    const here = path.join(checkouts(), id(900), 'out', 'shots');
    fs.mkdirSync(here, { recursive: true });
    fs.writeFileSync(path.join(here, 'deep.png'), 'x');
    const found = await ask('deep.png', id(900), 2_000_000);
    expect(found.ok && found.path).toBe(path.join(here, 'deep.png'));
  });

  it('looks in a folder made after it was asked about and found missing', async () => {
    const thread = id(901);
    expect((await ask('late.png', thread, 3_000_000)).ok).toBe(false);
    const here = path.join(checkouts(), thread, 'out');
    fs.mkdirSync(here, { recursive: true });
    fs.writeFileSync(path.join(here, 'late.png'), 'x');
    const found = await ask('late.png', thread, 3_000_100);
    expect(found.ok && found.path).toBe(path.join(here, 'late.png'));
  });
});

describe('a folder that cannot be watched', () => {
  it('is tried once for each walk of it, not once for each ask', async () => {
    const gone = path.join(root, 'no-such-project');
    for (let n = 0; n < 10; n++) await ask('missing.png', null, 4_000_000 + n, gone);
    expect(under(watched, gone)).toBe(1);
  });
});

describe('the list of files written elsewhere', () => {
  let home = '';
  let reads = 0;
  beforeEach(() => {
    home = fs.mkdtempSync(path.join(root, 'home-'));
    reads = 0;
    const readFileSync = fs.readFileSync.bind(fs);
    vi.spyOn(fs, 'readFileSync').mockImplementation(((file: fs.PathOrFileDescriptor, ...rest: unknown[]) => {
      if (String(file).endsWith('written-elsewhere.jsonl')) reads += 1;
      return (readFileSync as (...a: unknown[]) => unknown)(file, ...rest);
    }) as typeof fs.readFileSync);
  });

  it('is read once for fifty names, and again when a file is noted', async () => {
    const project = path.join(root, 'project-a');
    const elsewhere = path.join(root, 'other-folder');
    fs.mkdirSync(project, { recursive: true }); fs.mkdirSync(elsewhere, { recursive: true });
    fs.writeFileSync(path.join(elsewhere, 'plan.md'), 'x');
    noteWrittenElsewhere(project, { file: path.join(elsewhere, 'plan.md') }, { home });
    reads = 0;
    for (let n = 0; n < 50; n++) expect(writtenFileNamed(project, `missing-${n}.md`, { home })).toBeNull();
    expect(writtenFileNamed(project, 'plan.md', { home })).toBe(path.join(elsewhere, 'plan.md'));
    expect(reads).toBe(1);
    // A file noted later is seen at the next ask, whatever was kept.
    fs.writeFileSync(path.join(elsewhere, 'later.md'), 'x');
    noteWrittenElsewhere(project, { file: path.join(elsewhere, 'later.md') }, { home });
    reads = 0;
    expect(writtenFileNamed(project, 'later.md', { home })).toBe(path.join(elsewhere, 'later.md'));
    expect(writtenFileNamed(project, 'plan.md', { home })).toBe(path.join(elsewhere, 'plan.md'));
    expect(reads).toBe(1);
  });

  it('keeps each project\'s list to itself, and forgets a list that is deleted', async () => {
    const a = path.join(root, 'project-b');
    const b = path.join(root, 'project-c');
    const elsewhere = path.join(root, 'other-folder-2');
    for (const d of [a, b, elsewhere]) fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(elsewhere, 'only-a.md'), 'x');
    noteWrittenElsewhere(a, { file: path.join(elsewhere, 'only-a.md') }, { home });
    expect(writtenFileNamed(a, 'only-a.md', { home })).toBe(path.join(elsewhere, 'only-a.md'));
    expect(writtenFileNamed(b, 'only-a.md', { home })).toBeNull();
    fs.rmSync(home, { recursive: true, force: true });
    expect(writtenFileNamed(a, 'only-a.md', { home })).toBeNull();
  });
});
