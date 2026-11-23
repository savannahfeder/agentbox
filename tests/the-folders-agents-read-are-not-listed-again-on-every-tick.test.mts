// The folders agents read are not listed again on every tick.
//
// 2026-11-23: with no agent running, the app's main thread was still busy 14%
// of the time. Its own CPU record put Files on top: listing folders 18%, the
// look through every checkout 11%, a file's versions 8%, the list itself 6%.
// The supervisor asks on every pass (every 15 seconds, and each time anything
// wakes it) for the folders an agent's team_read shows, and each ask made the
// whole Files list again: every version of every file of every thread looked
// up on disk, with Files closed. The view is now made again when a folder or a
// filing changes, and otherwise once a minute.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { appFilesPlace, filesOfInternals, AGENTS_VIEW_KEPT_MS } from '../main/files-place.mts';

let place: ReturnType<typeof appFilesPlace>;
let dir = '';
let ids: string[] = [];
const lists = () => filesOfInternals.lists;
type AgentFolder = { folder: string; files: { file: string }[] };
const folders = async () => await place.forAgents() as AgentFolder[];

beforeEach(async () => {
  disk._internals.forgetFolds();
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-folders-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  dir = path.join(accountRoot, 'website');
  fs.mkdirSync(path.join(dir, 'designs'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'website', name: 'Website' }));
  fs.writeFileSync(path.join(dir, 'report.md'), 'the report');
  fs.writeFileSync(path.join(dir, 'designs', 'hero.png'), 'png');
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  place = appFilesPlace({ store, accountRoot, storeRoot });
  ids = [];
  for (let i = 0; i < 20; i += 1) {
    const id = disk.createWorkItem(dir, { title: `Thread ${i}` }).id;
    disk.updateWorkItem(dir, id, { note: 'Wrote [the report](report.md) and [hero](designs/hero.png)' });
    ids.push(id);
  }
});
afterEach(() => vi.restoreAllMocks());

it('makes the Files list once for ten asks with nothing changed', async () => {
  const before = lists();
  for (let n = 0; n < 10; n += 1) await folders();
  expect(lists() - before).toBe(1);
});

it('shows a file in its folder as soon as it is filed there', async () => {
  expect((await folders()).map((f) => f.folder)).toEqual([]);
  const before = lists();
  await place.fileIn({ project: 'Website', names: ['report.md'], folder: 'Reports' });
  const seen = await folders();
  expect(lists() - before).toBe(1);
  expect(seen.map((f) => f.folder)).toEqual(['Reports']);
  expect(seen[0].files.map((f) => f.file)).toEqual(['report.md']);
  // And a folder made empty is there at once too.
  await place.makeFolder({ project: 'Website', name: 'Pictures' });
  expect((await folders()).map((f) => f.folder).sort()).toEqual(['Pictures', 'Reports']);
});

it('is not made again because a thread said something', async () => {
  await folders();
  const before = lists();
  disk.updateWorkItem(dir, ids[3], { note: 'Tests pass.' });
  disk.updateWorkItem(dir, ids[4], { note: 'Also [notes](notes.md)' });
  await folders();
  expect(lists() - before).toBe(0);
});

it('is made again once its minute has passed, and not a moment before', async () => {
  const start = Date.now();
  const clock = vi.spyOn(Date, 'now').mockReturnValue(start);
  await folders();
  const before = lists();
  clock.mockReturnValue(start + AGENTS_VIEW_KEPT_MS - 1);
  await folders();
  expect(lists() - before).toBe(0);
  clock.mockReturnValue(start + AGENTS_VIEW_KEPT_MS);
  await folders();
  expect(lists() - before).toBe(1);
});

it('leaves the Files page its own list on every ask', async () => {
  const before = lists();
  await place.list();
  await place.list();
  expect(lists() - before).toBe(2);
});
