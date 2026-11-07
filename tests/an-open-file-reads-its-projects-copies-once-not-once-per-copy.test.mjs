// AN OPEN FILE READS ITS PROJECT'S COPIES ONCE, NOT ONCE PER COPY.
//
// The app froze for 0.6 to 1 second at a time, back to back, for hours: 810
// freezes in one day, every one in sameFile (main/files-place.mjs) by way of
// store.listProducts. An open file asks, on every change in the app, for the
// comments on other copies of each file its thread names. Each ask resolved
// every copy in the project on disk again, and each resolve read every project
// folder again. Measured on the real store: a thread naming 139 files read the
// project list over 60,000 times for one ask, about 900 a second, all of it on
// the main process. Now the copies of a project are resolved and hashed once
// for each state of the threads, and the project list is read once for that.
import { it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mjs';
import { Store } from '../main/store.mts';
import { appFilesPlace } from '../main/files-place.mjs';

const PNG = (n) => Buffer.from(`89504e470d0a1a0a0000000d49484452000000${String(n).padStart(2, '0')}`, 'hex');
const COPIES = 12;

let store, place, dir, threads, listed;
const attach = (saved, bytes) => {
  fs.mkdirSync(path.join(dir, 'attachments'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'attachments', saved), bytes);
  return `attachments/${saved}`;
};
const note = (id, file, text) => ({ do: 'note', id, file, place: { kind: 'pin', x: 0.2, y: 0.3 }, text });
// What an open thread sends on every change: one ask for every file it names.
const asks = (t) => place.sameFiles({ product: 'website', id: t.id, copies: t.files.map(({ saved, name }) => ({ path: `attachments/${saved}`, file: name })) });

beforeEach(async () => {
  disk._internals.forgetFolds();
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'copies-once-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  for (const id of ['website', 'billing', 'docs']) {
    fs.mkdirSync(path.join(accountRoot, id), { recursive: true });
    fs.writeFileSync(path.join(accountRoot, id, 'project.json'), JSON.stringify({ schemaVersion: 1, id, name: id }));
  }
  store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  dir = path.join(accountRoot, 'website');
  // Two threads that each attached the same twelve pictures.
  threads = [];
  for (const who of ['a', 'b']) {
    const t = await store.composeItem('website', { title: `Thread ${who}`, body: 'x' });
    const files = Array.from({ length: COPIES }, (_, i) => ({ saved: `mvwy00${i}${who}-${who}${who}-shot-${i}.png`, name: `shot-${i}.png` }));
    for (const f of files) attach(f.saved, PNG(i(f)));
    await disk.updateWorkItem(dir, t.id, { body: files.map((f) => `[${f.name}](attachments/${f.saved})`).join(' ') }, { source: 'founder' });
    threads.push({ id: t.id, files });
  }
  store.fileMark('website', threads[0].id, note('n-0', 'shot-0.png', 'On the first'));
  const real = store.listProducts.bind(store);
  listed = 0;
  store.listProducts = (...args) => { listed += 1; return real(...args); };
  place = appFilesPlace({ store, team: null, accountRoot, storeRoot });
});
function i(f) { return Number(/shot-(\d+)/.exec(f.name)[1]); }

it('asking for every file a thread names reads the project list a handful of times, not once per copy', async () => {
  const got = await asks(threads[1]);
  expect(got[0].notes.map((n) => n.id)).toEqual(['n-0']);
  // Before: 180.
  expect(listed).toBeLessThanOrEqual(4);
});

it('asking again while nothing changed resolves nothing again', async () => {
  await asks(threads[1]);
  listed = 0;
  await asks(threads[1]);
  expect(listed).toBeLessThanOrEqual(2);
});

it('a comment made after the first ask is there on the next one', async () => {
  await asks(threads[1]);
  store.fileMark('website', threads[0].id, note('n-5', 'shot-5.png', 'Later'));
  const got = await asks(threads[1]);
  expect(got[5].notes.map((n) => n.id)).toEqual(['n-5']);
  expect(got[0].notes.map((n) => n.id)).toEqual(['n-0']);
});

it('a picture of the same name with other bytes still does not join', async () => {
  // The second thread's shot-3 is redrawn: its comments are no longer the first thread's.
  store.fileMark('website', threads[0].id, note('n-3', 'shot-3.png', 'On the old one'));
  fs.writeFileSync(path.join(dir, 'attachments', threads[1].files[3].saved), PNG(99));
  const got = await asks(threads[1]);
  expect(got[3].notes).toEqual([]);
});

it('the thread view sends one ask for all its files, not one per file', () => {
  const view = fs.readFileSync(new URL('../renderer/src/components/ThreadArtifacts.tsx', import.meta.url), 'utf8');
  expect(view).toMatch(/api\.fileElsewhere\(\{ product: item\.product, id: item\.id, copies \}\)/);
  expect(view).not.toMatch(/copies\.map\(\(c\) => api\.fileElsewhere/);
});
