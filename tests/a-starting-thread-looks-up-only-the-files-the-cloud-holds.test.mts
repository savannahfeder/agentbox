// A starting thread looks up only the files the cloud holds.
//
// 2026-11-23: with every earlier fix loaded and four to six agents running, the
// app's own CPU record still put listing folders at 13% of the main thread's
// busy time and the look through every checkout at 7%, with bringBackFor at 6%
// and a file's versions at 5% beside them. As each agent starts, the app
// brings back any of its thread's files that were moved to the cloud, and to
// find them it looked every version of every file the thread names up on disk.
// The versions the cloud holds are known by their hashes without looking, and
// on that Mac almost no thread has one.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { appFilesPlace } from '../main/files-place.mts';

const sha = (body: string) => crypto.createHash('sha256').update(body).digest('hex');
const FILES = 10;
let dir = '';
let thread = '';
let other = '';
let back: string[] = [];
let off = new Set<string>();
let underAsked: string[] = [];
let keptRoot = '';
let place: ReturnType<typeof appFilesPlace>;

const keeper = {
  status: () => ({ offBytes: 10 }),
  off: (hash: string) => (off.has(hash) ? { size: 1, name: 'x', paths: [], at: 0 } : null),
  offUnder: (folder: string) => { underAsked.push(folder); return []; },
  opened() {},
  wantsVersions: async () => false,
  pass: async () => {},
  bringBack: async (hash: string) => { back.push(hash); return true; },
};
// Every look at one of the thread's files on disk, however it is made.
const looksAtItsFiles = async (fn: () => Promise<unknown>) => {
  const seen: string[] = [];
  const mine = (p: unknown) => { const s = String(p); if (/report-\d+\.md$/.test(s)) seen.push(s); };
  const exists = fs.existsSync.bind(fs);
  const stat = fs.promises.stat.bind(fs.promises);
  const statSync = fs.statSync.bind(fs);
  vi.spyOn(fs, 'existsSync').mockImplementation((p) => { mine(p); return exists(p); });
  vi.spyOn(fs.promises, 'stat').mockImplementation(((p: fs.PathLike, o?: never) => { mine(p); return stat(p, o); }) as typeof fs.promises.stat);
  vi.spyOn(fs, 'statSync').mockImplementation(((p: fs.PathLike, o?: never) => { mine(p); return statSync(p, o); }) as typeof fs.statSync);
  try { await fn(); return seen.length; } finally { vi.restoreAllMocks(); }
};

beforeEach(async () => {
  disk._internals.forgetFolds();
  back = []; off = new Set(); underAsked = [];
  const storeRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'start-files-')));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  dir = path.join(accountRoot, 'website');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'website', name: 'Website' }));
  for (let n = 0; n < FILES; n += 1) fs.writeFileSync(path.join(dir, `report-${n}.md`), `report ${n}`);
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  thread = disk.createWorkItem(dir, { title: 'The reports' }).id;
  disk.updateWorkItem(dir, thread, { note: Array.from({ length: FILES }, (_, n) => `[report ${n}](report-${n}.md)`).join(' ') });
  other = disk.createWorkItem(dir, { title: 'Another thread' }).id;
  disk.updateWorkItem(dir, other, { note: 'Tests pass.' });
  keptRoot = path.join(store.teammates?.dir?.() ?? storeRoot, '.file-versions', 'version-bytes');
  place = appFilesPlace({ store, accountRoot, storeRoot, keeper } as unknown as Parameters<typeof appFilesPlace>[0]);
  // Files has seen them once, so each has its place in the line of versions.
  await place.list();
});
afterEach(() => vi.restoreAllMocks());

describe('a thread starting while the cloud holds other threads\' files', () => {
  it('looks none of its own files up on disk when the cloud holds none of them', async () => {
    const looks = await looksAtItsFiles(async () => {
      expect(await place.bringBackFor({ product: 'website', id: thread })).toBe(true);
    });
    expect(looks).toBe(0);
    expect(back).toEqual([]);
  });

  it('still brings back the one file the cloud does hold, and only that one', async () => {
    off.add(sha('report 3'));
    // Moved to the cloud: gone from the project, and its kept copy with it.
    fs.rmSync(path.join(dir, 'report-3.md'));
    fs.rmSync(path.join(keptRoot, sha('report 3')), { recursive: true, force: true });
    expect(await place.bringBackFor({ product: 'website', id: thread })).toBe(true);
    expect(back).toEqual([sha('report 3')]);
  });

  it('does not bring back a file the cloud holds a copy of while it is still here', async () => {
    off.add(sha('report 5'));
    expect(await place.bringBackFor({ product: 'website', id: thread })).toBe(true);
    expect(back).toEqual([]);
  });

  it('still asks the cloud for what it took from the thread\'s own designs folder', async () => {
    await place.bringBackFor({ product: 'website', id: thread });
    expect(underAsked).toEqual([path.join(dir, 'designs', thread)]);
  });

  it('brings nothing back for a thread that names no file', async () => {
    off.add(sha('report 3'));
    fs.rmSync(path.join(dir, 'report-3.md'));
    expect(await place.bringBackFor({ product: 'website', id: other })).toBe(true);
    expect(back).toEqual([]);
  });
});
