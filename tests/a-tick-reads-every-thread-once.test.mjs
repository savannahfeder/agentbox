// The app froze 1056 times on 2026-11-08; the longest holds were the garbage
// collector, on a Mac swapping 12 GB, and the next were the whole-inbox read
// (readWorkItems under listItems). Measured with a heap sampler on a made-up
// inbox of 8 projects with 13 MB ledgers: one agents'-clock tick allocated
// 32 MB, 19 MB of it two full reads of every thread, one of them only to find
// the few threads with an open comment. Every collection on a swapping Mac
// pages the heap back in, so a tick now reads the threads once, again only
// when that pass wrote a mark, and each row is copied once instead of twice.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mjs';
import { Store } from '../main/store.mts';
import { Supervisor } from '../main/supervisor.mts';
import { noteToItsAgent, resolveAnsweredNotes } from '../main/notes-wake.mjs';

let store, dir, thread, reads;

beforeEach(async () => {
  disk._internals.forgetFolds();
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'one-read-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  dir = path.join(accountRoot, 'website');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'website', name: 'Website' }));
  store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  thread = store.composeItem('website', { title: 'Plan', body: 'Write the plan.' });
  disk.updateWorkItem(dir, thread.id, { result: `Here: designs/${thread.id}/plan.md` }, { source: 'agent' });
  const n1 = { do: 'note', id: 'n1', file: 'plan.md', place: { kind: 'whole' }, text: 'Shorter intro' };
  store.fileMark('website', thread.id, n1);
  await noteToItsAgent({ store, supervisor: { sessions: new Map(), wake: () => {} }, product: 'website', id: thread.id, mark: n1 });
  reads = 0;
  const list = store.listItems.bind(store);
  store.listItems = (...a) => { reads += 1; return list(...a); };
});

function supervisor() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'one-read-sup-'));
  const sup = new Supervisor({ storeRoot: tmp, maxConcurrentSessions: 0 }, store, tmp);
  sup.spawnWorker = () => {};
  sup.serveRepeats = async () => {};
  sup.seen = [];
  const stranded = sup.sayItOnEveryStrandedRow.bind(sup);
  sup.sayItOnEveryStrandedRow = (items, now) => { sup.seen = items; return stranded(items, now); };
  return sup;
}

describe('the comment pass works from the list it is handed', () => {
  it('reads nothing itself when handed the threads', () => {
    disk.updateWorkItem(dir, thread.id, { result: `Done: designs/${thread.id}/plan-v2.md` }, { source: 'agent' });
    const items = store.listItems();
    reads = 0;
    expect(resolveAnsweredNotes({ store, people: [], items })).toBe(1);
    expect(reads).toBe(0);
  });

  it('still reads them when it is not', () => {
    expect(resolveAnsweredNotes({ store, people: [] })).toBe(0);
    expect(reads).toBe(1);
  });
});

describe('one tick', () => {
  it('reads every thread once when no comment was answered', async () => {
    const sup = supervisor();
    await sup.tick();
    expect(reads).toBe(1);
    expect(sup.seen.map((i) => i.id)).toContain(thread.id);
  });

  it('reads again when it resolved a comment, so the rest of the pass sees it resolved', async () => {
    disk.updateWorkItem(dir, thread.id, { result: `Done: designs/${thread.id}/plan-v2.md` }, { source: 'agent' });
    const sup = supervisor();
    await sup.tick();
    expect(reads).toBe(2);
    expect(sup.seen.find((i) => i.id === thread.id).artifacts.notes[0]).toMatchObject({ resolved: true });
  });
});

describe('a row from the list is its own copy, made once', () => {
  it('carries its project, and editing it changes no later read', () => {
    const [row] = store.listItems();
    expect(row).toMatchObject({ product: 'website', productName: 'Website', id: thread.id });
    row.labels.push('edited');
    row.wrote.title = { ts: 1, source: 'nobody' };
    row.title = 'edited';
    const [again] = store.listItems();
    expect(again.labels).not.toContain('edited');
    expect(again.wrote.title.source).not.toBe('nobody');
    expect(again.title).toBe('Plan');
  });

  it('a project field on the ledger never overrides the project it was read from', () => {
    disk.updateWorkItem(dir, thread.id, { product: 'elsewhere' }, { source: 'agent' });
    expect(store.listItems()[0].product).toBe('website');
  });

  it('is built in the store with one spread, not a copy of a copy', () => {
    const src = fs.readFileSync(new URL('../main/store.mts', import.meta.url), 'utf8');
    const body = src.slice(src.indexOf('  listItems(now = Date.now())'), src.indexOf('  // THE NEXT PAGE OF FINISHED THREADS'));
    expect(body).not.toMatch(/\{ \.\.\.item, product/);
  });
});
