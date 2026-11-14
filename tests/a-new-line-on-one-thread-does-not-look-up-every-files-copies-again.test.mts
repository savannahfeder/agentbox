// On 2026-11-13 the app spent 40.8 s in the garbage collector, in 48 holds of
// up to 1.8 s. An open thread asks Files for its files each time it says more,
// and each ask after any change anywhere looked every copy of each of its files
// up on disk again. On the speed store (3,200 threads, 400 per project naming
// report.md) that was 2,801 lookups, 190 MB allocated and 0.9 s per ask.
//
// Measured by counting the version lists built, which is the work, rather than
// by a clock.
import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { appFilesPlace, filesOfInternals, CHAIN_KEEP_MS } from '../main/files-place.mts';

let place, dir, ids;

beforeEach(async () => {
  disk._internals.forgetFolds();
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'one-new-line-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  dir = path.join(accountRoot, 'website');
  fs.mkdirSync(path.join(dir, 'designs'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'website', name: 'Website' }));
  fs.writeFileSync(path.join(dir, 'designs', 'hero.png'), 'png');
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  place = appFilesPlace({ store, accountRoot, storeRoot });
  ids = [];
  for (let i = 0; i < 30; i += 1) {
    const id = disk.createWorkItem(dir, { title: `Thread ${i}` }).id;
    disk.updateWorkItem(dir, id, { note: 'Wrote [the report](report.md) and [hero](designs/hero.png)' });
    ids.push(id);
  }
});
afterEach(() => vi.restoreAllMocks());

const lineOf = (id) => place.lineFor({ product: 'website', id });
const built = () => filesOfInternals.chains;
const names = (line) => line.map((f) => f.versions.map((v) => v.name)).flat();

it('builds no file again when another thread says something that names none of them', async () => {
  expect(names(await lineOf(ids[0]))).toEqual(['hero.png']);
  const before = built();
  disk.updateWorkItem(dir, ids[7], { note: 'Tests pass.' });
  expect(names(await lineOf(ids[0]))).toEqual(['hero.png']);
  disk.updateWorkItem(dir, ids[0], { note: 'And this thread too.' });
  const line = await lineOf(ids[0]);
  expect(built() - before).toBe(0);
  expect(line[0].versions[0].here).toEqual(['designs/hero.png']);
});

it('builds again only the file a new line names', async () => {
  await lineOf(ids[0]);
  const before = built();
  disk.updateWorkItem(dir, ids[3], { note: 'Again: [hero](designs/hero.png)' });
  await lineOf(ids[3]);
  expect(built() - before).toBe(0);
  fs.writeFileSync(path.join(dir, 'designs', 'hero-v2.png'), 'png two');
  disk.updateWorkItem(dir, ids[3], { note: 'Next: [hero](designs/hero-v2.png)' });
  expect(names(await lineOf(ids[3]))).toEqual(['hero.png', 'hero-v2.png']);
  expect(built() - before).toBe(1);
});

it('looks again once the kept list is old, and finds a file that has arrived since', async () => {
  const start = Date.now();
  const clock = vi.spyOn(Date, 'now').mockReturnValue(start);
  expect(names(await lineOf(ids[0]))).toEqual(['hero.png']);
  fs.writeFileSync(path.join(dir, 'report.md'), '# Report\n');
  disk.updateWorkItem(dir, ids[1], { note: 'Tests pass.' });
  clock.mockReturnValue(start + CHAIN_KEEP_MS - 1);
  expect(names(await lineOf(ids[0]))).toEqual(['hero.png']);
  disk.updateWorkItem(dir, ids[2], { note: 'Tests pass.' });
  clock.mockReturnValue(start + CHAIN_KEEP_MS + 1);
  expect(names(await lineOf(ids[0])).sort()).toEqual(['hero.png', 'report.md']);
});
