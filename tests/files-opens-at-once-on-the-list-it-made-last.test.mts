// FILES OPENS AT ONCE ON THE LIST IT MADE LAST.
//
// The first time Files opened after the app started, the page showed its title
// and search box and nothing else until the list of files came, which on a store
// of 3,348 files took 3.5 to 11 seconds on a quiet Mac
// (scripts/scratch/time-files-list.mjs, 2026-11-22) and longer inside the busy
// app. The person took that for the whole page. The app now keeps the last list
// it made and makes one soon after it starts. The page's first read gets that
// list at once, and a fresh one follows as a change when it differs.
//
// What must NOT happen: an ordinary read getting the old list (a file just moved
// would jump back), a fresh list that changed nothing pushing a change (the page
// would read again and again), or a first read before any list getting nothing.
import { it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { appFilesPlace } from '../main/files-place.mts';

let place, dir, id, notified;
const names = (list) => list.files.map((f) => f.name).sort();
const addPicture = (name) => {
  fs.writeFileSync(path.join(dir, 'designs', name), 'png');
  disk.updateWorkItem(dir, id, { note: `Here: [${name}](designs/${name})` });
};

beforeEach(async () => {
  disk._internals.forgetFolds();
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'files-soon-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  dir = path.join(accountRoot, 'website');
  fs.mkdirSync(path.join(dir, 'designs'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'website', name: 'Website' }));
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  notified = 0;
  place = appFilesPlace({ store, accountRoot, storeRoot, notify: () => { notified += 1; } });
  id = disk.createWorkItem(dir, { title: 'The landing page' }).id;
  addPicture('hero.png');
});

it('waits for a list when none was made yet', async () => {
  expect(names(await place.listSoon())).toEqual(['hero.png']);
});

it('hands back the last list at once, then a change once a fresh one differs', async () => {
  await place.list();
  addPicture('footer.png');
  expect(names(await place.listSoon())).toEqual(['hero.png']);
  await vi.waitFor(() => expect(notified).toBe(1));
  expect(names(await place.listSoon())).toEqual(['footer.png', 'hero.png']);
});

it('pushes no change when the fresh list is the same', async () => {
  await place.list();
  await place.listSoon();
  await place.list();
  expect(notified).toBe(0);
});

it('never hands an ordinary read the old list', async () => {
  await place.list();
  addPicture('footer.png');
  expect(names(await place.list())).toEqual(['footer.png', 'hero.png']);
});

it('is what the page asks for only on its first read, and the app makes a list soon after it starts', () => {
  const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
  expect(read('../main/ipc.mts')).toMatch(/soon === true \? place\.listSoon\(\) : place\.list\(\)/);
  expect(read('../main/ipc.mts')).toMatch(/setTimeout\(\(\) => \{ void filesPlaceNow\(\)\.list\(\)/);
  expect(read('../preload.cjs')).toMatch(/filesPlace: \(opts\) => ipcRenderer\.invoke\('zero:files-place', opts\)/);
  expect(read('../renderer/src/files/FilesPlace.tsx')).toMatch(/read\(!lastList\)/);
});
