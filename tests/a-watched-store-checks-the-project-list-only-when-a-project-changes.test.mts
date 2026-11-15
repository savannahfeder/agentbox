// A WATCHED STORE CHECKS THE PROJECT LIST ONLY WHEN A PROJECT CHANGES.
//
// On 2026-11-12 the app's main thread was held 2,691 times, and the biggest
// share of the app's own code in those holds was the project list being
// stamped again: about 137 s of busy samples in stampable and _stampProducts,
// more than the garbage collector's own 124 s. The kept list stood for one
// millisecond, so the window's status request, the cloud checks and the tick
// each took a stat of every project folder, its project.json and its code
// folder: about 140 on a store of 48 projects, on a Mac 17 GB into swap.
// Measured on a made-up store of 48 projects: 173 checks costing 6.8 s of the
// main thread in about 70 s of use before this.
//
// The store already watches the account root and every project folder, so
// while it does, what those watchers see clears the kept list and nothing else
// needs to. These are the ways that must still be seen at once, and the
// watcher that fails, after which the list is checked every millisecond again.
import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mts';

vi.setConfig({ testTimeout: 20_000, hookTimeout: 20_000 });

let store: Store, accountRoot: string, stats: number;
const realStatSync = fs.statSync;
const project = (slug: string, extra = {}) => {
  fs.mkdirSync(path.join(accountRoot, slug), { recursive: true });
  fs.writeFileSync(path.join(accountRoot, slug, 'project.json'), JSON.stringify({ schemaVersion: 1, id: slug, name: slug, ...extra }));
};
const aMomentLater = (ms = 5) => new Promise((r) => { setTimeout(r, ms); });
// A watcher's event comes on the event loop, not inside the write, and on a
// busy Mac it can come seconds later. The count going up is what proves the
// watcher saw it rather than the five-second keep running out.
const seen = async (ok: () => boolean) => {
  const before = store._projectEvents;
  for (let i = 0; i < 300 && store._projectEvents === before; i += 1) await aMomentLater(50);
  expect(store._projectEvents).toBeGreaterThan(before);
  return ok();
};
const slugs = () => store.listProducts().map((p) => p.slug);

beforeEach(async () => {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'watched-project-list-'));
  accountRoot = path.join(storeRoot, 'accounts', 'a');
  for (const slug of ['billing', 'docs', 'website']) project(slug);
  store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  // Events for the folders just made can still arrive after the watch starts.
  await aMomentLater(1000);
  store.watch();
  await aMomentLater(500);
  store._projectEvents = 0;
  store.forgetProducts();
  stats = 0;
  (fs as { statSync: unknown }).statSync = (file: fs.PathLike, ...rest: unknown[]) => {
    if (String(file).endsWith('project.json')) stats += 1;
    return (realStatSync as (...a: unknown[]) => unknown)(file, ...rest);
  };
});

afterEach(() => {
  fs.statSync = realStatSync;
  store.unwatch();
});

it('readings spread over time take no stamps while nothing changes', async () => {
  store.listProducts();
  stats = 0;
  for (let i = 0; i < 20; i += 1) {
    await aMomentLater();
    store.listProducts();
  }
  // Before: 3 a reading, 60.
  expect(stats).toBe(0);
});

it('a project another process renamed is seen without waiting out the keep', async () => {
  store.listProducts();
  project('docs', { name: 'The handbook' });
  expect(await seen(() => store.listProducts().find((p) => p.slug === 'docs')?.name === 'The handbook')).toBe(true);
});

it('a project another process made is seen', async () => {
  store.listProducts();
  project('payroll');
  expect(await seen(() => slugs().includes('payroll'))).toBe(true);
});

it('a project another process removed is seen', async () => {
  store.listProducts();
  fs.rmSync(path.join(accountRoot, 'docs'), { recursive: true, force: true });
  expect(await seen(() => !slugs().includes('docs'))).toBe(true);
});

it('what the app writes itself is read back in the same breath', () => {
  store.listProducts();
  store.setOneLiner('docs', 'Everything we know');
  expect(store.listProducts().find((p) => p.slug === 'docs')?.oneLiner).toBe('Everything we know');
});

it('a file written in a project folder that is not its project.json keeps the list', async () => {
  store.listProducts();
  stats = 0;
  fs.writeFileSync(path.join(accountRoot, 'docs', 'notes.md'), 'hello\n');
  await aMomentLater(200);
  store.listProducts();
  expect(stats).toBe(0);
});

it('once a watcher fails the list is stamped again every millisecond', async () => {
  store.listProducts();
  // The last is a project folder's; the first may be the teammates folder's.
  store.watchers.at(-1)!.emit('error', new Error('EMFILE'));
  stats = 0;
  await aMomentLater();
  store.listProducts();
  expect(stats).toBe(3);
});

it('a store that stopped watching stamps the list again every millisecond', async () => {
  store.listProducts();
  store.unwatch();
  stats = 0;
  await aMomentLater();
  store.listProducts();
  expect(stats).toBe(3);
});
