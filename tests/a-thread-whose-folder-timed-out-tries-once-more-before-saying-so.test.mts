// A THREAD WHOSE FOLDER TIMED OUT TRIES ONCE MORE BEFORE SAYING SO.
//
// A folder job that hangs is now ended at its deadline
// (tests/one-stuck-folder-does-not-stop-every-other-thread-starting). Reported
// as it stood, every thread caught behind the hang would land in Needs you
// saying it "did not start", when the hung git was already killed and a second
// try goes through. You asked on 2026-11-15 that the inbox hold only what needs
// you, not threads that failed for the app's own reasons. So the first timeout
// starts the thread again by itself; a second in a row is said on the row.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';
import { folderJob } from '../main/task-folders-offthread.mts';

vi.mock('../main/task-folders-offthread.mts', () => ({ folderJob: vi.fn() }));

const timedOut = () => Object.assign(Error('making this thread\'s folder took more than 5 minutes, so it was stopped'), { timedOut: true });

let root: string;
let item: { id: string; product: string; status: string; title: string };
let product: { slug: string; dir: string; repoPath: string };
let results: { id: string; result: string }[];
let sup: Supervisor;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'folder-timeout-'));
  const repo = path.join(root, 'repo');
  fs.mkdirSync(repo);
  item = { id: 'w-2222222222', product: 'sample', status: 'open', title: 'Fix the login page' };
  product = { slug: 'sample', dir: repo, repoPath: repo };
  results = [];
  sup = new Supervisor(
    { home: root, storeRoot: root, authProfiles: ['default'] },
    {
      listItems: () => [item], listProducts: () => [product], isDue: () => true,
      recordSessionResult: (_slug: string, id: string, { result }: { result: string }) => { results.push({ id, result }); },
    },
    root,
  );
  vi.mocked(folderJob).mockReset();
});

afterEach(() => {
  sup.stop();
  fs.rmSync(root, { recursive: true, force: true });
});

/** Each start goes to `_folderFirst`, as the real one does for a row with no folder yet. */
function startsThroughTheFolder() {
  const started: string[] = [];
  sup.spawnWorker = (row, opts) => {
    if (sup._folderFirst(row, product, 'claude', opts)) return;
    started.push(row.id);
  };
  return started;
}

const settle = () => new Promise((r) => setTimeout(r, 20));

describe('a folder job that ran out of time', () => {
  it('starts the thread again by itself, and says nothing on it when the second try works', async () => {
    vi.mocked(folderJob)
      .mockRejectedValueOnce(timedOut())
      .mockResolvedValueOnce({ taken: true, path: product.repoPath } as never);
    const started = startsThroughTheFolder();

    sup.spawnWorker(item, {});
    await settle();

    expect(folderJob).toHaveBeenCalledTimes(2);
    expect(started).toEqual([item.id]);
    expect(results).toEqual([]);
  });

  it('says so on the thread when the second try runs out of time too, and tries no third time', async () => {
    vi.mocked(folderJob).mockRejectedValue(timedOut());
    const started = startsThroughTheFolder();

    sup.spawnWorker(item, {});
    await settle();

    expect(folderJob).toHaveBeenCalledTimes(2);
    expect(started).toEqual([]);
    expect(results).toHaveLength(1);
    expect(results[0].result).toMatch(/took more than 5 minutes/);
  });

  it('a folder refused for any other reason is said at once, with no second try', async () => {
    vi.mocked(folderJob).mockRejectedValue(Error('the disk is full'));
    const started = startsThroughTheFolder();

    sup.spawnWorker(item, {});
    await settle();

    expect(folderJob).toHaveBeenCalledTimes(1);
    expect(started).toEqual([]);
    expect(results[0].result).toMatch(/the disk is full/);
  });

  it('a later timeout, after a folder was made, gets its own quiet second try', async () => {
    vi.mocked(folderJob)
      .mockRejectedValueOnce(timedOut())
      .mockResolvedValueOnce({ taken: true, path: product.repoPath } as never)
      .mockRejectedValueOnce(timedOut())
      .mockResolvedValueOnce({ taken: true, path: product.repoPath } as never);
    const started = startsThroughTheFolder();

    sup.spawnWorker(item, {});
    await settle();
    sup.spawnWorker(item, {});
    await settle();

    expect(started).toEqual([item.id, item.id]);
    expect(results).toEqual([]);
  });
});
