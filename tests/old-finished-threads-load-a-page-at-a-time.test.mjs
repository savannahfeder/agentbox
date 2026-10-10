// FINISHED THREADS PAST THE 8 MB READ COME BACK A PAGE AT A TIME.
//
// Reported 2026-10-07 (w-fda2165ec6): "done" and "all" did not contain most of
// her tasks. Measured on her store the same day: the app reads only the last
// 8 MB of a project's ledger, and Astral's was 12.8 MB, so 155 of its 508
// finished threads were on no tab at all and nothing said they were missing.
// 21 more had their first lines before the cut and drew with blank titles.
//
// Her answer was that old threads need not load up front: "if you're
// scrolling or whatever more should populate as needed". So the snapshot keeps
// a window of complete finished items and the rest is asked for a page at a
// time, newest finished first. Active state is always folded from the full
// ledger. Archived projects stay hidden, which was the other half of her answer.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mjs';
import { machineryPath } from '../main/store/home.mjs';

const T0 = Date.UTC(2026, 7, 13, 12);
const MIN = 60_000;

let tmp, accountRoot, store;

function project(slug, extra = {}) {
  const dir = path.join(accountRoot, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: slug, name: slug, ...extra }));
  return dir;
}

// Lines the fold reads but whose padding pushes everything before them out of
// the 8 MB window. 45 lines of 200 KB is 9 MB.
function pushPastTheCut(dir, at) {
  const file = machineryPath(dir, 'work-items.jsonl');
  const pad = 'x'.repeat(200 * 1024);
  let text = '';
  for (let i = 0; i < 45; i++) text += JSON.stringify({ id: 'w-ffffffffff', ts: at + i, source: 'agent', patch: { note: `filler ${i}` }, pad }) + '\n';
  fs.appendFileSync(file, text);
}

beforeEach(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'older-'));
  accountRoot = path.join(tmp, 'accounts', 'a');
  fs.mkdirSync(accountRoot, { recursive: true });
  store = await new Store({ storeRoot: tmp, accountId: 'a', accountRoot, products: [] }).init();
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

function seedBigLedger(slug = 'astral') {
  const dir = project(slug);
  const disk = store.modules.workItemsDisk;
  const old = [];
  for (let i = 0; i < 5; i++) {
    const it = disk.createWorkItem(dir, { title: `Old ${i}` }, { now: T0 + i * MIN });
    disk.updateWorkItem(dir, it.id, { status: 'done' }, { now: T0 + i * MIN + 1 });
    old.push(it.id);
  }
  const stillOpen = disk.createWorkItem(dir, { title: 'Old and still open' }, { now: T0 + 10 * MIN }).id;
  const straddler = disk.createWorkItem(dir, { title: 'Started long ago' }, { now: T0 + 11 * MIN }).id;
  pushPastTheCut(dir, T0 + 20 * MIN);
  disk.updateWorkItem(dir, straddler, { status: 'done' }, { now: T0 + 30 * MIN });
  const recent = disk.createWorkItem(dir, { title: 'Recent' }, { now: T0 + 31 * MIN }).id;
  disk.updateWorkItem(dir, recent, { status: 'done' }, { now: T0 + 32 * MIN });
  return { dir, old, stillOpen, straddler, recent };
}

describe('a ledger past the 8 MB read', () => {
  it('pages old finished threads without showing a partially folded row', () => {
    const { old, straddler } = seedBigLedger();
    const shown = store.listItems(T0 + 60 * MIN);
    for (const id of old) expect(shown.find((i) => i.id === id)).toBeUndefined();
    expect(shown.find((i) => i.id === straddler)).toBeUndefined();
  });

  it('hands back the finished threads it cut off, newest finished first, with their project', () => {
    const { old, straddler } = seedBigLedger();
    const page = store.listOlderItems({ offset: 0, limit: 50, now: T0 + 60 * MIN });
    expect(page.more).toBe(false);
    expect(page.items.map((i) => i.id)).toEqual([straddler, ...old.slice().reverse()]);
    expect(page.items[0]).toMatchObject({ title: 'Started long ago', status: 'done', product: 'astral', productName: 'astral' });
  });

  it('gives a half-cut thread back whole, title and all', () => {
    const { straddler } = seedBigLedger();
    const whole = store.listOlderItems({ now: T0 + 60 * MIN }).items.find((i) => i.id === straddler);
    expect(whole.title).toBe('Started long ago');
    expect(whole.createdAt).toBe(T0 + 11 * MIN);
  });

  it('pages: a limit leaves the rest for the next call, and says there is more', () => {
    const { old, straddler } = seedBigLedger();
    const first = store.listOlderItems({ offset: 0, limit: 2, now: T0 + 60 * MIN });
    expect(first.items.map((i) => i.id)).toEqual([straddler, old[4]]);
    expect(first.more).toBe(true);
    const rest = store.listOlderItems({ offset: 2, limit: 50, now: T0 + 60 * MIN });
    expect(rest.items.map((i) => i.id)).toEqual([old[3], old[2], old[1], old[0]]);
    expect(rest.more).toBe(false);
  });

  it('does not hand back a thread the snapshot already has whole, or one that is not finished', () => {
    const { recent, stillOpen } = seedBigLedger();
    const ids = store.listOlderItems({ now: T0 + 60 * MIN }).items.map((i) => i.id);
    expect(ids).not.toContain(recent);
    expect(ids).not.toContain(stillOpen);
    expect(ids).not.toContain('w-ffffffffff');
  });
});

describe('what must not come back', () => {
  it('a ledger that fits in the read has nothing older to give', () => {
    const dir = project('small');
    const disk = store.modules.workItemsDisk;
    const it = disk.createWorkItem(dir, { title: 'Small' }, { now: T0 });
    disk.updateWorkItem(dir, it.id, { status: 'done' }, { now: T0 + 1 });
    expect(store.listOlderItems({ now: T0 + MIN })).toEqual({ items: [], more: false });
  });

  it('an archived project stays hidden, however big its ledger', () => {
    seedBigLedger('gone');
    const pj = path.join(accountRoot, 'gone', 'project.json');
    fs.writeFileSync(pj, JSON.stringify({ ...JSON.parse(fs.readFileSync(pj, 'utf8')), archived: true }));
    expect(store.listOlderItems({ now: T0 + 60 * MIN })).toEqual({ items: [], more: false });
  });
});
