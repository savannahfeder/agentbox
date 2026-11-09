// The phone copy lists the files a thread names, and looked for each name in
// every folder it might be in, one disk check per name per folder, with no
// name counted once. A long thread names the same files hundreds of times. On
// the founder's Mac on 2026-11-01 the app's freeze log (the freeze watcher's
// thread) put 19 freezes, 1,809 s in all and one of 939 s, in filesNamed under
// the phone's publish. Counted here by disk calls, not by a clock.
import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { filesNamed } from '../main/phone-uploads.mts';

let root, docs, repo;
const put = (file) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, 'x'); };

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'phone-named-')));
  docs = path.join(root, 'docs');
  repo = path.join(root, 'repo');
  put(path.join(docs, 'designs', 'hero.png'));
  put(path.join(docs, 'attachments', 'brief.pdf'));
  put(path.join(docs, 'notes.md'));
  put(path.join(repo, 'designs', 'logo.svg'));
  put(path.join(root, 'elsewhere', 'stray.png'));
  for (let i = 0; i < 40; i += 1) put(path.join(docs, 'shots', `shot-${i}.png`));
});
afterEach(() => vi.restoreAllMocks());

const longThread = (names, times) => ({
  item: { id: 'w-0123456789', title: 'A long one' },
  history: Array.from({ length: times }, (_, i) => ({ patch: { note: `Round ${i}: ${names.join(', ')}` } })),
});
const keys = (snap) => filesNamed(snap, { dir: docs, repoPath: repo, home: root }).map((f) => f.key).sort();

it('finds what it found before: each name where the screens look, and nothing outside the project', () => {
  const snap = longThread(['hero.png', 'brief.pdf', 'notes.md', 'logo.svg', 'stray.png', 'missing.png', 'shots/shot-3.png'], 3);
  expect(keys(snap)).toEqual(['@repo/designs/logo.svg', 'attachments/brief.pdf', 'designs/hero.png', 'notes.md', 'shots/shot-3.png']);
});

it('a name said hundreds of times is looked for once', () => {
  const names = [...Array.from({ length: 40 }, (_, i) => `shots/shot-${i}.png`), 'hero.png', 'missing.png', 'brief.pdf'];
  const snap = longThread(names, 300);
  const exists = vi.spyOn(fs, 'existsSync');
  const found = keys(snap);
  expect(found).toHaveLength(42);
  // A disk check only to confirm a file its folder's listing has: at most one per name.
  expect(exists.mock.calls.length).toBeLessThanOrEqual(names.length);
});

it('a name differing only in case is found exactly when the disk says it is there', () => {
  const snap = longThread(['HERO.PNG'], 1);
  const there = fs.existsSync(path.join(docs, 'designs', 'HERO.PNG'));
  expect(keys(snap).length).toBe(there ? 1 : 0);
});
