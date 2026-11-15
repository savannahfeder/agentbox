// An open thread asks Files which files it names on every change in the app
// (zero:file-line), and each ask re-derived the title and change stamp of every
// thread in the store to learn that nothing had changed. On a store of 3,200
// threads (scripts/scratch/perf, 2026-11-02) that was 53 ms a call, two calls per
// change, all of it on the main thread, mostly in shortTitle. The first ask after
// launch ran the file-name pattern over every message of every thread: 946 ms.
//
// Measured by counting thread entries built and messages searched, which is the
// work, rather than by a clock, which a busy machine makes flaky.
import { it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { appFilesPlace, filesOfInternals } from '../main/files-place.mts';
import { filesInLines, filesInLinesInternals } from '../shared/artifact-marks.mts';

let store, place, accountRoot, dir, ids;

beforeEach(async () => {
  disk._internals.forgetFolds();
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'open-thread-'));
  accountRoot = path.join(storeRoot, 'accounts', 'a');
  dir = path.join(accountRoot, 'website');
  fs.mkdirSync(path.join(dir, 'designs'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'website', name: 'Website' }));
  fs.writeFileSync(path.join(dir, 'designs', 'hero.png'), 'png');
  store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  place = appFilesPlace({ store, accountRoot, storeRoot });
  ids = [];
  for (let i = 0; i < 40; i += 1) ids.push(disk.createWorkItem(dir, { title: `Thread number ${i} about the landing page` }).id);
  disk.updateWorkItem(dir, ids[0], { note: 'Here: [hero.png](designs/hero.png)' });
});

const lineOf = (id) => place.lineFor({ product: 'website', id });
const built = () => filesOfInternals.entries;

it('builds no thread again when nothing changed', async () => {
  expect((await lineOf(ids[0])).map((f) => f.versions[0].name)).toEqual(['hero.png']);
  const before = built();
  await lineOf(ids[0]);
  await lineOf(ids[1]);
  expect(built() - before).toBe(0);
});

it('builds only the thread that changed, and sees what it now names', async () => {
  await lineOf(ids[0]);
  const before = built();
  disk.updateWorkItem(dir, ids[5], { note: 'Same picture: [hero.png](designs/hero.png)' });
  const line = await lineOf(ids[5]);
  expect(built() - before).toBe(1);
  expect(line.map((f) => f.versions[0].name)).toEqual(['hero.png']);
});

it('builds every thread of a project again when the project is renamed', async () => {
  await lineOf(ids[0]);
  const before = built();
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'website', name: 'Site' }));
  await lineOf(ids[0]);
  expect(built() - before).toBe(ids.length);
});

it('a renamed thread is built again with its new title', async () => {
  await lineOf(ids[0]);
  const before = built();
  disk.updateWorkItem(dir, ids[0], { title: 'The hero picture' }, { source: 'founder' });
  await lineOf(ids[0]);
  expect(built() - before).toBe(1);
});

it('a message with no file extension in it is not searched, and the rest find what they did', () => {
  const lines = (texts) => texts.map((note, i) => ({ id: 'w-1', ts: i, source: 'agent', patch: { note } }));
  const named = (texts) => filesInLines(lines(texts)).map((f) => f.path);
  expect(named(['Nothing to see here, just words.', 'Still no file at all'])).toEqual([]);
  expect(named(['See REPORT.MD for it', 'and `designs/a.png`', '[clip](out/b.mp4)'])).toEqual(['REPORT.MD', 'designs/a.png', 'out/b.mp4']);
  // Close to a file but not one: the extension check lets it through and the pattern still refuses it.
  expect(named(['notes.mdx and page.pngs'])).toEqual([]);
  const searched = filesInLinesInternals.searched;
  filesInLines(lines(['plain words only', 'more plain words']));
  expect(filesInLinesInternals.searched - searched).toBe(0);
  filesInLines(lines(['one names a.md']));
  expect(filesInLinesInternals.searched - searched).toBe(1);
});
