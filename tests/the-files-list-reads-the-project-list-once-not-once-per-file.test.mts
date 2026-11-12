// THE FILES LIST READS THE PROJECT LIST ONCE A PASS, NOT ONCE PER FILE.
//
// Files sat blank, with no word that it was loading, long enough to be filed as
// stuck. Measured on the real store (3,545 files, ~4,800 versions): one pass of
// list() took 3.2 to 6.2 seconds and read the project list 4,811 times, once
// for every version it looked for on disk, each read a stat of every project
// folder on the main process. The app's freeze log had 128 stalls in one day in
// that path. A pass reruns on every change in the app, so the page's first read
// queued behind passes like it.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { appFilesPlace } from '../main/files-place.mts';
import { versionLine } from '../main/version-line.mts';

const PNG = (n) => Buffer.from(`89504e470d0a1a0a0000000d49484452000000${String(n).padStart(4, '0')}`, 'hex');

let store, place, dir, listed;
const threadWith = async (title, count, from = 0) => {
  const t = await store.composeItem('website', { title, body: 'x' });
  fs.mkdirSync(path.join(dir, 'attachments'), { recursive: true });
  const links = [];
  for (let i = from; i < from + count; i += 1) {
    const saved = `mvwy${String(i).padStart(4, '0')}-ab-shot-${i}.png`;
    fs.writeFileSync(path.join(dir, 'attachments', saved), PNG(i));
    links.push(`[shot-${i}.png](attachments/${saved})`);
  }
  await disk.updateWorkItem(dir, t.id, { body: links.join(' ') }, { source: 'founder' });
};

beforeEach(async () => {
  disk._internals.forgetFolds();
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'files-list-once-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  for (const id of ['website', 'billing', 'docs']) {
    fs.mkdirSync(path.join(accountRoot, id), { recursive: true });
    fs.writeFileSync(path.join(accountRoot, id, 'project.json'), JSON.stringify({ schemaVersion: 1, id, name: id }));
  }
  store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  dir = path.join(accountRoot, 'website');
  const real = store.listProducts.bind(store);
  listed = 0;
  store.listProducts = (...args) => { listed += 1; return real(...args); };
  place = appFilesPlace({ store, team: null, accountRoot, storeRoot });
});

it('a pass over 40 files reads the project list a handful of times', async () => {
  await threadWith('Shots', 40);
  listed = 0;
  const { files } = await place.list();
  expect(files).toHaveLength(40);
  // Before: 43.
  expect(listed).toBeLessThanOrEqual(6);
});

it('ten times the files reads it no more often', async () => {
  await threadWith('Few', 4);
  listed = 0;
  await place.list();
  const few = listed;
  await threadWith('Many', 36, 4);
  listed = 0;
  await place.list();
  expect(listed).toBe(few);
});

it('every file is still found on disk and drawn', async () => {
  await threadWith('Shots', 5);
  const { files } = await place.list();
  expect(files.map((f) => f.name).sort()).toEqual(['shot-0.png', 'shot-1.png', 'shot-2.png', 'shot-3.png', 'shot-4.png']);
  for (const f of files) expect(f.opened && fs.existsSync(f.opened)).toBe(true);
});

// The same store had ~4,700 versions in team projects that the team cloud had
// never numbered, so all of them waited. Finding one file's versions looked
// through every waiting one: 1.3 s of each pass.
describe('versions the cloud has not numbered', () => {
  const WAITING = 3000;
  let line, srcs;
  beforeEach(async () => {
    const disk = fs.mkdtempSync(path.join(os.tmpdir(), 'waiting-'));
    line = versionLine({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'waiting-line-')), cloud: () => ({ append: async () => { throw new Error('no'); }, read: async () => [] }) });
    srcs = Array.from({ length: WAITING }, (_, i) => { const f = path.join(disk, `f${i}.png`); fs.writeFileSync(f, `bytes ${i}`); return f; });
    for (let i = 0; i < WAITING; i += 1) await line.add({ file: `p\0f${i}\0image`, src: srcs[i], name: `f${i}.png` });
  });

  it('each file still shows its own waiting version, and only its own', () => {
    expect(line.of('p\0f7\0image')).toMatchObject([{ n: 1, pending: true }]);
    expect(line.of('p\0f7\0image')).toHaveLength(1);
    expect(line.of('p\0nobody\0image')).toEqual([]);
  });

  it('a second waiting version of one file is its v2', async () => {
    fs.writeFileSync(srcs[7], 'new bytes');
    await line.add({ file: 'p\0f7\0image', src: srcs[7], name: 'f7.png' });
    expect(line.of('p\0f7\0image').map((v) => v.n)).toEqual([1, 2]);
  });

  it('looking up every file once does not look through every waiting version each time', () => {
    const t = performance.now();
    for (let i = 0; i < WAITING; i += 1) line.of(`p\0f${i}\0image`);
    // Before: about 125 ms here, and 4 ms after.
    expect(performance.now() - t).toBeLessThan(40);
  });
});

it('a project made after one pass is seen by the next', async () => {
  await place.list();
  fs.mkdirSync(path.join(store.config.accountRoot, 'later'), { recursive: true });
  fs.writeFileSync(path.join(store.config.accountRoot, 'later', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'later', name: 'later' }));
  const t = await store.composeItem('later', { title: 'Later', body: 'x' });
  const ldir = path.join(store.config.accountRoot, 'later');
  fs.mkdirSync(path.join(ldir, 'attachments'), { recursive: true });
  fs.writeFileSync(path.join(ldir, 'attachments', 'mvwy9999-ab-late.png'), PNG(9999));
  await disk.updateWorkItem(ldir, t.id, { body: '[late.png](attachments/mvwy9999-ab-late.png)' }, { source: 'founder' });
  const { files } = await place.list();
  expect(files.find((f) => f.name === 'late.png')?.opened).toBeTruthy();
});

// Leaving Files and coming back threw the list away, so every visit started blank.
it('Files draws the list it last had while it reads a fresh one', () => {
  const page = fs.readFileSync(new URL('../renderer/src/files/FilesPlace.tsx', import.meta.url), 'utf8');
  expect(page).toMatch(/useState<FilesPlaceList \| null>\(\(\) => lastList\)/);
  expect(page).toMatch(/lastList = l;/);
});
