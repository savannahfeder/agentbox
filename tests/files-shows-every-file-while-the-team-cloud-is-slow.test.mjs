// FILES SHOWS EVERY FILE WHILE THE TEAM CLOUD IS SLOW.
//
// "none of my files/artifacts agents create are showing up on the files page":
// Files was blank, with not even its empty line, so the list never arrived.
// Measured from the code: the list waited on the team cloud to number each new
// version, one file after another, with only the five-minute request deadline
// between them; and every change in the app started another whole list on top
// of the one still running. The freeze log had the list stuck 125 times that
// day, and no version had been numbered since the morning. Now a list waits a
// moment at most, a version the cloud has not numbered shows as pending, a cloud
// that failed is left alone for a while, and lists asked for while one runs share it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mjs';
import { Store } from '../main/store.mts';
import { appFilesPlace, filesOfInternals } from '../main/files-place.mjs';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

async function aMac(holder, { seenBy = 'team', files = 5 } = {}) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'slow-cloud-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  const dir = path.join(accountRoot, 'app');
  fs.mkdirSync(path.join(dir, 'designs'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'app', name: 'App', seenBy }));
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const team = { state: () => ({ me: { id: 'me' }, team: { id: 't' }, cards: [] }), fileVersions: () => holder };
  let told = 0;
  const place = appFilesPlace({ store, team, accountRoot, storeRoot, notify: () => { told += 1; } });
  const t = store.composeItem('app', { title: 'Pictures', body: 'x' });
  for (let i = 0; i < files; i += 1) {
    const name = `shot-${i}.png`;
    fs.writeFileSync(path.join(dir, 'designs', name), Buffer.concat([PNG, Buffer.from(name)]));
    await disk.updateWorkItem(dir, t.id, { note: `[${name}](designs/${name})` }, { source: 'agent' });
  }
  return { place, told: () => told };
}

const within = (ms, p) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error(`no list after ${ms} ms`)), ms))]);
const numbered = (calls, { late = 0, fail = false } = {}) => ({
  read: async () => [],
  append: async (row) => {
    calls.push(row);
    if (late) await new Promise((r) => setTimeout(r, late));
    if (fail) throw new Error('the cloud said no');
    return { ...row, n: calls.filter((c) => c.file === row.file).length };
  },
});

describe('the Files list with the team cloud out of reach', () => {
  it('arrives with every file when the cloud never answers', async () => {
    const calls = [];
    const m = await aMac({ read: async () => [], append: (row) => { calls.push(row); return new Promise(() => {}); } });
    const list = await within(8000, m.place.list());
    expect(list.files.map((f) => f.name).sort()).toEqual(['shot-0.png', 'shot-1.png', 'shot-2.png', 'shot-3.png', 'shot-4.png']);
    expect(calls).toHaveLength(1);
  }, 15000);

  it('asks a cloud that failed once, not once per file, and not again on the next list', async () => {
    const calls = [];
    const m = await aMac(numbered(calls, { fail: true }));
    expect((await m.place.list()).files).toHaveLength(5);
    expect((await m.place.list()).files).toHaveLength(5);
    expect(calls).toHaveLength(1);
  });

  it('takes the cloud number of a late answer, and says the list moved', async () => {
    const calls = [];
    const m = await aMac(numbered(calls, { late: 2500 }), { files: 1 });
    expect((await m.place.list()).files).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 800));
    expect(m.told()).toBeGreaterThan(0);
    expect((await m.place.list()).files[0].versions).toBe(1);
    expect(calls).toHaveLength(1);
  }, 15000);
});

describe('with the cloud answering', () => {
  it('numbers every file by the cloud, as before', async () => {
    const calls = [];
    const m = await aMac(numbered(calls));
    expect((await m.place.list()).files).toHaveLength(5);
    expect(calls).toHaveLength(5);
  });

  it('never asks the cloud about a project nobody else sees', async () => {
    const calls = [];
    const m = await aMac(numbered(calls), { seenBy: 'private' });
    expect((await m.place.list()).files).toHaveLength(5);
    expect(calls).toHaveLength(0);
  });
});

describe('lists asked for while one is running', () => {
  it('share it and one more after, however many are asked', async () => {
    const m = await aMac(numbered([]));
    const before = filesOfInternals.lists;
    const all = await Promise.all(Array.from({ length: 20 }, () => m.place.list()));
    expect(all.every((l) => l.files.length === 5)).toBe(true);
    expect(filesOfInternals.lists - before).toBeLessThanOrEqual(2);
  });

  it('a list asked after the last one finished reads afresh', async () => {
    const m = await aMac(numbered([]));
    await m.place.list();
    const before = filesOfInternals.lists;
    await m.place.list();
    expect(filesOfInternals.lists - before).toBe(1);
  });
});
