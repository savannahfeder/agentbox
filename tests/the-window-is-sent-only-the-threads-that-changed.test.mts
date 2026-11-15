// THE WINDOW IS SENT ONLY THE THREADS THAT CHANGED.
//
// On 2026-10-30 a 16 GB Mac running three agents, all in the cloud, was
// swapping 14 GB, and Activity Monitor put Agentbox's window at 3.78 GB. On a
// copy with 2,275 threads and three agents talking, measured: each snapshot was
// 11.3 MB, the window asked for one 92 times a minute (every push while an
// agent writes), and the window's memory went from 680 MB to 1.84 GB in 20
// minutes. Its live heap after a forced collection stayed at 77 MB the whole
// time: nothing leaked, the window was swallowing about a gigabyte a minute of
// threads it already had.
//
// So the window asks with the token of the last answer it holds, and the
// computer answers with the threads and other parts that changed since that
// answer, the ones that are gone, and the order when it moved. A running agent
// carries its live detail only to the screen that has its thread open: at 200
// agents the 40-line log each one carried would be 8,000 lines on every read.
// A window, a phone or a computer that knows nothing of tokens gets and gives
// the whole list, as before.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapshotSender, snapshotReader, lightRunning } from '../shared/snapshot-delta.mts';
import { bootHeadless } from '../main/serve.mts';
import { encodeProjectPath } from '../main/store/home.mts';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const row = (id, extra = {}) => ({ id, product: 'p', productName: 'P', title: `Thread ${id}`, status: 'open', body: `the ask of ${id}`, labels: [], ...extra });
const whole = (items, rest = {}) => ({ products: [{ slug: 'p' }], supervisor: { running: [] }, ...rest, items });
const plain = (x) => JSON.parse(JSON.stringify(x));
const withoutToken = ({ snapshotToken, ...rest }) => rest;

describe('the sender and the reader', () => {
  it('a first ask gets every thread', () => {
    const send = snapshotSender();
    const read = snapshotReader();
    const got = read.take(send.answer(whole([row('a'), row('b')]), read.ask()?.since));
    expect(got.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(read.ask()?.since).toBeTruthy();
  });

  it('after one thread changes, the next answer carries that thread alone, and the window holds what a whole read would', () => {
    const send = snapshotSender();
    const read = snapshotReader();
    const items = Array.from({ length: 50 }, (_, i) => row(`t${i}`));
    read.take(plain(send.answer(whole(items), read.ask()?.since)));
    const next = items.map((i) => (i.id === 't7' ? { ...i, status: 'done', result: 'finished' } : i));
    const answer = plain(send.answer(whole(next, { supervisor: { running: [{ itemId: 't9' }] } }), read.ask().since));
    expect(answer.items).toBeUndefined();
    expect(answer.delta.changed.map((i) => i.id)).toEqual(['t7']);
    expect(answer.delta.removed).toEqual([]);
    const got = read.take(answer);
    expect(plain(withoutToken(got))).toEqual(plain(withoutToken(whole(next, { supervisor: { running: [{ itemId: 't9' }] } }))));
  });

  it('a thread that is unchanged is not sent, and keeps the object the window already had', () => {
    const send = snapshotSender();
    const read = snapshotReader();
    const first = read.take(plain(send.answer(whole([row('a'), row('b')]), undefined)));
    const answer = plain(send.answer(whole([row('a'), row('b', { title: 'renamed' })]), read.ask().since));
    expect(answer.delta.changed.map((i) => i.id)).toEqual(['b']);
    const second = read.take(answer);
    expect(second.items[0]).toBe(first.items[0]);
    expect(second.items[1]).not.toBe(first.items[1]);
    expect(second.items[1].title).toBe('renamed');
  });

  it('two projects may hold the same id, and each is its own thread', () => {
    const send = snapshotSender();
    const read = snapshotReader();
    const two = [row('a'), row('a', { product: 'q', productName: 'Q' })];
    read.take(plain(send.answer(whole(two), undefined)));
    const next = [row('a'), row('a', { product: 'q', productName: 'Q', title: 'only in q' })];
    const answer = plain(send.answer(whole(next), read.ask().since));
    expect(answer.delta.changed.map((i) => `${i.product}/${i.id}`)).toEqual(['q/a']);
    expect(plain(read.take(answer).items)).toEqual(plain(next));
  });

  it('a thread that left is named, and is gone from the window', () => {
    const send = snapshotSender();
    const read = snapshotReader();
    read.take(plain(send.answer(whole([row('a'), row('b'), row('c')]), undefined)));
    const answer = plain(send.answer(whole([row('a'), row('c')]), read.ask().since));
    expect(answer.delta.removed).toEqual(['p/b']);
    expect(read.take(answer).items.map((i) => i.id)).toEqual(['a', 'c']);
  });

  it('a new thread and a new order arrive in the order the computer has', () => {
    const send = snapshotSender();
    const read = snapshotReader();
    read.take(plain(send.answer(whole([row('a'), row('b'), row('c')]), undefined)));
    const same = plain(send.answer(whole([row('a'), row('b'), row('c')]), read.ask().since));
    expect(same.delta.order).toBeNull();
    read.take(same);
    const next = [row('d'), row('c'), row('a'), row('b')];
    const answer = plain(send.answer(whole(next), read.ask().since));
    expect(answer.delta.changed.map((i) => i.id)).toEqual(['d']);
    expect(read.take(answer).items.map((i) => i.id)).toEqual(['d', 'c', 'a', 'b']);
  });

  it('an ask from an answer the computer no longer holds, or never gave, gets every thread', () => {
    const send = snapshotSender({ keep: 2 });
    const read = snapshotReader();
    read.take(plain(send.answer(whole([row('a')]), undefined)));
    const old = read.ask().since;
    send.answer(whole([row('a')]), undefined);
    send.answer(whole([row('a')]), undefined);
    const answer = plain(send.answer(whole([row('a'), row('b')]), old));
    expect(answer.delta).toBeUndefined();
    expect(answer.items.map((i) => i.id)).toEqual(['a', 'b']);
    const restarted = snapshotSender();
    expect(plain(restarted.answer(whole([row('a')]), old)).items).toHaveLength(1);
  });

  it('two answers to the same ask, landing in order, each give the right list', () => {
    const send = snapshotSender();
    const read = snapshotReader();
    read.take(plain(send.answer(whole([row('a'), row('b')]), undefined)));
    const base = read.ask().since;
    const one = plain(send.answer(whole([row('a', { title: 'one' }), row('b')]), base));
    const two = plain(send.answer(whole([row('a', { title: 'one' }), row('b', { title: 'two' })]), base));
    expect(read.take(one).items.map((i) => i.title)).toEqual(['one', 'Thread b']);
    expect(read.take(two).items.map((i) => i.title)).toEqual(['one', 'two']);
  });

  it('an answer for a base the window has dropped is not drawn as a half list', () => {
    const read = snapshotReader();
    expect(read.take({ snapshotToken: 'x2', delta: { since: 'never-held', changed: [row('a')], removed: [], order: null }, products: [] })).toBeNull();
    expect(read.ask()).toBeUndefined();
  });

  it('an answer from a computer that knows nothing of tokens is taken whole', () => {
    const read = snapshotReader();
    const got = read.take(whole([row('a')]));
    expect(got.items.map((i) => i.id)).toEqual(['a']);
    expect(read.ask()).toBeUndefined();
    expect(read.take(null)).toBeNull();
  });
});

describe('what else the window is sent', () => {
  it('a part of the snapshot that did not change is not sent again, and one that did is', () => {
    const send = snapshotSender();
    const read = snapshotReader();
    const rest = { products: [{ slug: 'p', name: 'P' }], config: { a: 1 }, supervisor: { running: [] } };
    read.take(plain(send.answer(whole([row('a')], rest), undefined)));
    const next = { ...rest, products: plain(rest.products), supervisor: { running: [{ itemId: 'a' }] } };
    const answer = plain(send.answer(whole([row('a')], next), read.ask().since));
    expect(answer.products).toBeUndefined();
    expect(answer.config).toBeUndefined();
    expect(answer.supervisor).toEqual({ running: [{ itemId: 'a' }] });
    const got = read.take(answer);
    expect(got.products).toEqual(rest.products);
    expect(got.config).toEqual({ a: 1 });
    expect(got.supervisor.running).toHaveLength(1);
  });

  it('a part that went away goes away in the window too', () => {
    const send = snapshotSender();
    const read = snapshotReader();
    read.take(plain(send.answer(whole([row('a')], { team: { me: 1 } }), undefined)));
    const answer = plain(send.answer({ products: whole([]).products, supervisor: whole([]).supervisor, items: [row('a')] }, read.ask().since));
    expect(answer.delta.gone).toEqual(['team']);
    expect('team' in read.take(answer)).toBe(false);
  });

  it('threads that did not change are never turned into text to find that out', () => {
    const send = snapshotSender();
    let turned = 0;
    const counted = (id) => ({ ...row(id), toJSON() { turned += 1; return row(id); } });
    const first = send.answer(whole(Array.from({ length: 200 }, (_, i) => counted(`t${i}`))), undefined);
    turned = 0;
    send.answer(whole(Array.from({ length: 200 }, (_, i) => ({ ...first.items[i] }))), first.snapshotToken);
    expect(turned).toBe(0);
  });

  it('an older answer landing after a newer one does not put the list back', () => {
    const send = snapshotSender();
    const read = snapshotReader();
    read.take(plain(send.answer(whole([row('a')]), undefined)));
    const base = read.ask().since;
    const older = plain(send.answer(whole([row('a', { title: 'older' })]), base));
    const newer = plain(send.answer(whole([row('a', { title: 'newer' })]), base));
    expect(read.take(newer).items[0].title).toBe('newer');
    expect(read.take(older).items[0].title).toBe('newer');
    expect(read.ask().since).toBe(newer.snapshotToken);
  });

  it('a computer that restarted is believed, though its count starts again', () => {
    const read = snapshotReader();
    const first = snapshotSender();
    read.take(plain(first.answer(whole([row('a')]), undefined)));
    read.take(plain(first.answer(whole([row('b')]), undefined)));
    const restarted = snapshotSender();
    expect(read.take(plain(restarted.answer(whole([row('c')]), undefined))).items[0].id).toBe('c');
  });
});

describe('what a running agent costs the window', () => {
  const session = (id) => ({ itemId: id, product: 'p', startedAt: 1, engine: 'claude', tail: Array.from({ length: 40 }, (_, i) => `line ${i}`), activity: [{ label: 'older' }, { label: 'newest' }], saying: 'halfway through a sentence', sayingAt: 5 });

  it('an agent nobody has open carries its newest step and nothing else', () => {
    const [light] = lightRunning([session('a')], { product: 'p', id: 'other' });
    expect(light.tail).toEqual([]);
    expect(light.activity).toEqual([{ label: 'newest' }]);
    expect(light.saying).toBe('');
    expect(light.itemId).toBe('a');
    expect(light.startedAt).toBe(1);
  });

  it('the thread on screen keeps every detail, and only in its own project', () => {
    const [same, other] = lightRunning([session('a'), { ...session('a'), product: 'q' }], { product: 'p', id: 'a' });
    expect(same.tail).toHaveLength(40);
    expect(same.saying).toBe('halfway through a sentence');
    expect(other.tail).toEqual([]);
  });

  it('nothing open means nothing carries detail', () => {
    expect(lightRunning([session('a')], null)[0].saying).toBe('');
  });

  it('two hundred agents with no thread open are a few kilobytes more, not hundreds', () => {
    const light = lightRunning(Array.from({ length: 200 }, (_, i) => session(`t${i}`)), null);
    expect(JSON.stringify(light).length).toBeLessThan(40_000);
  });
});

describe('through the real store and the real handler', () => {
  let dir, booted, snapshot, slug, ids;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-delta-'));
    const storeRoot = path.join(dir, 'store');
    fs.writeFileSync(path.join(dir, 'zero.config.json'), JSON.stringify({ storeRoot, accountId: 'delta-account' }));
    slug = 'delta';
    const project = path.join(storeRoot, 'accounts', 'delta-account', slug);
    fs.mkdirSync(project, { recursive: true });
    fs.writeFileSync(path.join(project, 'project.json'), JSON.stringify({ schemaVersion: 2, id: slug, name: 'Delta' }));
    const machinery = path.join(storeRoot, 'projects', encodeProjectPath(project));
    fs.mkdirSync(machinery, { recursive: true });
    fs.writeFileSync(path.join(machinery, '.origin'), `${project}\n`);
    ids = Array.from({ length: 40 }, (_, i) => `w-delta${String(i).padStart(4, '0')}`);
    const at = Date.now() - 60_000;
    const lines = ids.flatMap((id, i) => [
      { id, ts: at + i, source: 'system', patch: { title: `Thread ${i}`, status: 'done', kind: 'task', priority: 0, labels: [] } },
      { id, ts: at + i + 1, source: 'agent', patch: { result: `What thread ${i} found.` } },
    ]);
    fs.writeFileSync(path.join(machinery, 'work-items.jsonl'), `${lines.map((l) => JSON.stringify(l)).join('\n')}\n`);
    booted = await bootHeadless({ dataDir: dir, appDir: repoRoot, userDir: dir });
    snapshot = booted.channels.get('zero:snapshot');
  }, 30_000);

  afterAll(async () => {
    try { booted?.supervisor.killAll(); booted?.supervisor.stop(); } catch { /* done */ }
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('an agent writing to one thread sends the window that thread alone', async () => {
    const read = snapshotReader();
    const first = read.take(plain(await snapshot({}, read.ask())));
    expect(first.items.filter((i) => i.product === slug)).toHaveLength(40);
    booted.store.noteItem(slug, ids[5], 'Halfway through, and the tests are green.');
    const answer = plain(await snapshot({}, read.ask()));
    expect(answer.items).toBeUndefined();
    expect(answer.delta.changed.map((i) => i.id)).toEqual([ids[5]]);
    const got = read.take(answer);
    const fresh = plain(await snapshot({}, undefined));
    expect(plain(got.items)).toEqual(fresh.items);
    expect(JSON.stringify(answer).length).toBeLessThan(JSON.stringify(fresh).length / 4);
    expect(answer.products).toBeUndefined();
  });

  it('a window that asks with nothing gets the whole list, as every older one does', async () => {
    const answer = await snapshot({}, undefined);
    expect(answer.items.filter((i) => i.product === slug)).toHaveLength(40);
    expect(answer.delta).toBeUndefined();
  });
});
