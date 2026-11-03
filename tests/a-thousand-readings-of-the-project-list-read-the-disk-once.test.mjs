// A THOUSAND READINGS OF THE PROJECT LIST READ THE DISK ONCE.
//
// The freeze recorder caught the app's main thread held 3,020 times on
// 2026-11-01, 13,649 s in all, and 1,473 of those holds — 6,825 s, the longest
// 1,068 s — were in store.listProducts. The call reads the account root, then
// stats, reads and parses a project.json per project and reads the names in its
// code folder: 0.29 ms on a store of nine projects, and any caller that asks in
// a loop turns that into the spinning wheel. Measured on a made-up store of
// nine projects: 121,000 readings in one stretch, which is what one ask of an
// open file's comments did on the real store, took 35.05 s before this and
// 0.03 s after. Callers had been fixed one at a time twice in two days; this
// pins the floor under all of them.
//
// The keeping has to be honest, so the rest of these are the ways the answer
// can go stale: a project made, renamed or removed by another process, a code
// folder that gains its first file, and a write the app makes itself, which
// must be readable back in the same breath.
import { it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mjs';

let store, accountRoot, reads;
const realReadFileSync = fs.readFileSync;
const project = (slug, extra = {}) => {
  fs.mkdirSync(path.join(accountRoot, slug), { recursive: true });
  fs.writeFileSync(path.join(accountRoot, slug, 'project.json'), JSON.stringify({ schemaVersion: 1, id: slug, name: slug, ...extra }));
};
// A reading of the list more than a millisecond after the last one, which is
// where the stamps are taken again.
const aMomentLater = () => new Promise((r) => { setTimeout(r, 5); });

beforeEach(async () => {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'project-list-'));
  accountRoot = path.join(storeRoot, 'accounts', 'a');
  for (const slug of ['billing', 'docs', 'website']) project(slug);
  store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  reads = 0;
  fs.readFileSync = (file, ...rest) => {
    if (String(file).endsWith('project.json')) reads += 1;
    return realReadFileSync(file, ...rest);
  };
});

afterEach(() => { fs.readFileSync = realReadFileSync; });

it('a thousand readings in one stretch read each project.json once', () => {
  store.forgetProducts();
  const first = store.listProducts();
  expect(reads).toBe(3);
  for (let i = 0; i < 1000; i += 1) expect(store.listProducts()).toEqual(first);
  // Before: 3,000.
  expect(reads).toBe(3);
});

it('every caller gets a list of its own, so one of them sorting it changes nothing', () => {
  const mine = store.listProducts();
  mine.reverse();
  mine.push({ slug: 'not a project' });
  expect(store.listProducts().map((p) => p.slug)).toEqual(['billing', 'docs', 'website']);
});

it('a project another process made is in the list', async () => {
  expect(store.listProducts().map((p) => p.slug)).toEqual(['billing', 'docs', 'website']);
  project('payroll');
  await aMomentLater();
  expect(store.listProducts().map((p) => p.slug)).toEqual(['billing', 'docs', 'payroll', 'website']);
});

it('a project another process renamed is in the list under its new name', async () => {
  store.listProducts();
  project('docs', { name: 'The handbook' });
  await aMomentLater();
  expect(store.listProducts().find((p) => p.slug === 'docs').name).toBe('The handbook');
});

it('a project another process removed is gone from the list', async () => {
  store.listProducts();
  fs.rmSync(path.join(accountRoot, 'docs'), { recursive: true, force: true });
  await aMomentLater();
  expect(store.listProducts().map((p) => p.slug)).toEqual(['billing', 'website']);
});

it('a code folder that gains its first file says the project has code', async () => {
  const repoPath = path.join(accountRoot, '_code');
  fs.mkdirSync(repoPath, { recursive: true });
  project('website', { repoPath });
  await aMomentLater();
  expect(store.listProducts().find((p) => p.slug === 'website').code).toBe(false);
  fs.writeFileSync(path.join(repoPath, 'index.js'), 'console.log(1)\n');
  await aMomentLater();
  expect(store.listProducts().find((p) => p.slug === 'website').code).toBe(true);
});

it('what the app writes itself is read back in the same breath', () => {
  expect(store.listProducts().map((p) => p.slug)).toEqual(['billing', 'docs', 'website']);
  store.setProductArchived('docs', true);
  expect(store.listProducts().map((p) => p.slug)).toEqual(['billing', 'website']);
  expect(store.listProducts({ includeArchived: true }).find((p) => p.slug === 'docs').archived).toBe(true);
  store.setProductArchived('docs', false);
  expect(store.listProducts().map((p) => p.slug)).toEqual(['billing', 'docs', 'website']);
  store.setOneLiner('docs', 'Everything we know');
  expect(store.listProducts().find((p) => p.slug === 'docs').oneLiner).toBe('Everything we know');
  store.setProductSeenBy('docs', { who: 'team' });
  expect(store.listProducts().find((p) => p.slug === 'docs').seenBy).toBe('team');
});

it('an account root that cannot be read answers with nothing and does not keep it', async () => {
  const gone = path.join(accountRoot, 'nowhere');
  const other = await new Store({ storeRoot: accountRoot, accountId: 'a', accountRoot: gone, products: [] }).init();
  expect(other.listProducts()).toEqual([]);
  fs.mkdirSync(gone, { recursive: true });
  fs.mkdirSync(path.join(gone, 'late'), { recursive: true });
  fs.writeFileSync(path.join(gone, 'late', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'late', name: 'late' }));
  await aMomentLater();
  expect(other.listProducts().map((p) => p.slug)).toEqual(['late']);
});
