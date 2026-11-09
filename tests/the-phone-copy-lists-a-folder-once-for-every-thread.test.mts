// Each thread's phone copy listed the project's folders again for itself, so a
// pass over 300 threads listed the same documents folder 300 times. The freeze
// log put 29 holds, 4,642 s in all, in readdirSync under filesNamed on
// 2026-11-03 and 41 holds, 7,281 s, on 2026-11-05. Counted here by folder
// listings across threads, not by a clock.
import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { filesNamed } from '../main/phone-uploads.mts';

let root, docs, repo;
const put = (file) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, 'x'); };

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'phone-lists-')));
  docs = path.join(root, 'docs');
  repo = path.join(root, 'repo');
  put(path.join(docs, 'designs', 'hero.png'));
  put(path.join(docs, 'notes.md'));
  put(path.join(repo, 'designs', 'logo.svg'));
});
afterEach(() => vi.restoreAllMocks());

const thread = (i, names) => ({ item: { id: `w-${String(i).padStart(10, '0')}`, title: 'A thread' }, history: [{ patch: { note: `See ${names.join(', ')}` } }] });
const keysOf = (snap, listings) => filesNamed(snap, { dir: docs, repoPath: repo, home: root, listings }).map((f) => f.key).sort();

it('lists each folder once across 300 threads that share the listings', () => {
  const listings = new Map();
  const list = vi.spyOn(fs, 'readdirSync');
  for (let i = 0; i < 300; i += 1) expect(keysOf(thread(i, ['hero.png', 'notes.md', 'logo.svg', 'gone.png']), listings)).toEqual(['@repo/designs/logo.svg', 'designs/hero.png', 'notes.md']);
  const perFolder = new Map();
  for (const [dir] of list.mock.calls) perFolder.set(String(dir), (perFolder.get(String(dir)) ?? 0) + 1);
  expect(Math.max(...perFolder.values())).toBe(1);
});

it('finds a file added to a folder after it was listed', () => {
  const listings = new Map();
  expect(keysOf(thread(1, ['late.png']), listings)).toEqual([]);
  put(path.join(docs, 'designs', 'late.png'));
  const later = new Date(Date.now() + 5000);
  fs.utimesSync(path.join(docs, 'designs'), later, later);
  expect(keysOf(thread(2, ['late.png']), listings)).toEqual(['designs/late.png']);
});

it('finds a file in a folder that did not exist when it was first looked for', () => {
  const listings = new Map();
  expect(keysOf(thread(1, ['brief.pdf']), listings)).toEqual([]);
  put(path.join(docs, 'attachments', 'brief.pdf'));
  expect(keysOf(thread(2, ['brief.pdf']), listings)).toEqual(['attachments/brief.pdf']);
});

it('drops a file taken out of a folder after it was listed', () => {
  const listings = new Map();
  expect(keysOf(thread(1, ['hero.png']), listings)).toEqual(['designs/hero.png']);
  fs.rmSync(path.join(docs, 'designs', 'hero.png'));
  expect(keysOf(thread(2, ['hero.png']), listings)).toEqual([]);
});

it('without shared listings, finds what it found before', () => {
  expect(keysOf(thread(1, ['hero.png', 'notes.md', 'logo.svg', 'gone.png']))).toEqual(['@repo/designs/logo.svg', 'designs/hero.png', 'notes.md']);
});
