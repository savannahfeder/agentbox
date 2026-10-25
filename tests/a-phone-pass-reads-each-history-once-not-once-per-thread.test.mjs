// THE APP SPUN ITS BEACHBALL WITHOUT STOPPING once a project was put on the
// phone (2026-10-14). The phone pass (main/phone-inbox.mjs) builds a copy of
// every thread worth carrying, up to 300 a project, and asked
// `store.readHistory` for each one. That read the project's whole ledger off
// disk and parsed every line, so a pass read the same file 300 times. Measured
// against the real agentbox-team ledger (17,797 lines, 7.7 MB): 101 ms for one
// read, 20,929 ms for the 300, all of it on the thread that draws the window,
// and the team sync started the next pass as soon as one finished.
//
// So the history is read once per change to the file and kept, keyed on the
// file's own identity the way the fold is (a-warm-fold-still-reads-the-file).
// What that must not cost: a line written after the read is still seen, from
// this process or another one, and one thread never sees another's lines.
// And a pass only builds the copies of threads that changed (below).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mjs';
import * as disk from '../main/store/work-items.mjs';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';
import { createPhoneInbox } from '../main/phone-inbox.mjs';
import { threadSnapshot } from '../shared/phone-snapshot.mjs';

let root, store, ids;

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-pass-'));
  const dir = path.join(root, 'kestrel');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'kestrel', name: 'kestrel' }));
  store = await new Store({ accountRoot: root, products: [] }).init();
  ids = [];
  for (let i = 0; i < 40; i += 1) {
    const made = store.composeItem('kestrel', { title: `thread ${i}` });
    store.answerItem('kestrel', made.id, { answer: `reply to ${i}` });
    ids.push(made.id);
  }
});
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });

const ledger = () => disk._internals.ledgerPath(path.join(root, 'kestrel'));
const readsOf = (spy, file) => spy.mock.calls.filter(([f]) => f === file).length;

describe('a pass over every thread of a project', () => {
  it('reads the ledger once, not once per thread', () => {
    const file = ledger();
    const spy = vi.spyOn(fs, 'readFileSync');
    for (const id of ids) store.readHistory('kestrel', id);
    expect(readsOf(spy, file)).toBeLessThanOrEqual(1);
  });

  it('a second pass over an unchanged ledger reads it not at all', () => {
    for (const id of ids) store.readHistory('kestrel', id);
    const spy = vi.spyOn(fs, 'readFileSync');
    for (const id of ids) store.readHistory('kestrel', id);
    expect(readsOf(spy, ledger())).toBe(0);
  });

  it('a pass after a write reads it once again, and sees the write', () => {
    for (const id of ids) store.readHistory('kestrel', id);
    store.answerItem('kestrel', ids[3], { answer: 'one more' });
    const spy = vi.spyOn(fs, 'readFileSync');
    const all = ids.map((id) => store.readHistory('kestrel', id));
    expect(readsOf(spy, ledger())).toBe(1);
    expect(all[3].map((l) => l.patch?.answer).filter(Boolean)).toEqual(['reply to 3', 'one more']);
  });
});

// With the reads fixed, building 300 copies was still 261 of the 361 ms a pass
// took on that ledger, every few seconds, for threads that had not changed.
describe('a pass builds the copies of the threads that changed, and no others', () => {
  const NOW = Date.parse('2026-10-14T12:00:00Z');
  function inbox(items, history) {
    const cloud = createMemoryCloud();
    cloud.now = () => NOW;
    const me = signUpMemory(cloud, { email: `owner-${Math.random()}@example.com` });
    let built = 0;
    const box = createPhoneInbox({
      backend: memoryBackend(cloud, me),
      owner: me.id,
      projects: () => [{ slug: 'alpha', name: 'Alpha' }],
      listItems: () => items,
      historyOf: (_slug, id) => history[id] ?? [],
      apply: async () => {},
      stateFile: path.join(root, 'phone-inbox.json'),
      now: () => NOW,
      build: (...a) => { built += 1; return threadSnapshot(...a); },
    });
    return { box, built: () => built };
  }
  const row = (id, extra = {}) => ({ id, title: `Thread ${id}`, status: 'open', updatedAt: NOW - 1000, createdAt: NOW - 5000, ...extra });
  const said = (id, ts, answer) => ({ id, ts, source: 'founder', patch: { answer } });

  it('a second pass over nothing changed builds nothing and sends nothing', async () => {
    const items = Array.from({ length: 30 }, (_, i) => row(`w-${String(i).padStart(10, '0')}`));
    const t = inbox(items, {});
    expect((await t.box.syncOnce()).sent).toBe(30);
    const first = t.built();
    expect((await t.box.syncOnce()).sent).toBe(0);
    expect(t.built()).toBe(first);
  });

  it('a row that changed is built and sent, even when its time did not move', async () => {
    const items = [row('w-0000000001'), row('w-0000000002')];
    const t = inbox(items, {});
    await t.box.syncOnce();
    const first = t.built();
    items[0] = row('w-0000000001', { result: 'Done, it works.' });
    expect((await t.box.syncOnce()).sent).toBe(1);
    expect(t.built()).toBe(first + 1);
  });

  it('a thread with a new line is built and sent, and the one beside it is not', async () => {
    const history = { 'w-0000000001': [said('w-0000000001', NOW - 900, 'first')], 'w-0000000002': [said('w-0000000002', NOW - 900, 'other')] };
    const t = inbox([row('w-0000000001'), row('w-0000000002')], history);
    await t.box.syncOnce();
    const first = t.built();
    history['w-0000000001'] = [...history['w-0000000001'], said('w-0000000001', NOW - 900, 'second, in the same moment')];
    expect((await t.box.syncOnce()).sent).toBe(1);
    expect(t.built()).toBe(first + 1);
  });
});

describe('what each thread is handed', () => {
  it('only its own lines, oldest first', () => {
    const h = store.readHistory('kestrel', ids[7]);
    expect(h.length).toBeGreaterThan(0);
    expect(h.every((l) => l.id === ids[7])).toBe(true);
    expect(h.map((l) => l.patch?.answer).filter(Boolean)).toEqual(['reply to 7']);
    expect(h.map((l) => l.ts)).toEqual([...h.map((l) => l.ts)].sort((a, b) => a - b));
  });

  it('a line another process appended after the read', () => {
    store.readHistory('kestrel', ids[0]);
    disk._internals.appendLine(ledger(), { id: ids[0], ts: Date.now() + 5, source: 'founder', patch: { answer: 'from the phone' } });
    expect(store.readHistory('kestrel', ids[0]).at(-1).patch.answer).toBe('from the phone');
  });

  it('no heartbeat or release lines, and no more than it asked for', async () => {
    const id = ids[1];
    await disk.claimWorkItem(path.join(root, 'kestrel'), { id, holder: 'w' });
    disk._internals.appendLine(ledger(), { id, ts: Date.now() + 1, heartbeat: true });
    disk._internals.appendLine(ledger(), { id, ts: Date.now() + 2, release: true });
    for (let i = 0; i < 6; i += 1) store.answerItem('kestrel', id, { answer: `more ${i}` });
    const h = store.readHistory('kestrel', id);
    expect(h.some((l) => l.heartbeat || l.release)).toBe(false);
    const two = store.readHistory('kestrel', id, { max: 2 });
    expect(two.map((l) => l.patch.answer)).toEqual(['more 4', 'more 5']);
  });

  it('a thread nobody wrote gets nothing, and an id that is not a row id gets nothing', () => {
    expect(store.readHistory('kestrel', 'w-0000000000')).toEqual([]);
    expect(store.readHistory('kestrel', '../etc')).toEqual([]);
  });

  it('changing what it was handed changes nothing the next caller sees', () => {
    const h = store.readHistory('kestrel', ids[2]);
    try { h.push({ id: ids[2], ts: 1, source: 'agent', patch: { answer: 'pushed' } }); } catch { /* frozen is fine too */ }
    try { h[0].patch.title = 'scribbled'; } catch { /* frozen is fine too */ }
    const again = store.readHistory('kestrel', ids[2]);
    expect(again.some((l) => l.patch?.answer === 'pushed')).toBe(false);
    expect(again[0].patch.title).toBe('thread 2');
  });
});
