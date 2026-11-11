// A RESTART DOES NOT READ EVERY FILE AGAIN TO FINGERPRINT IT.
//
// On 2026-11-10 the freeze recorder's worst holds were the garbage collector,
// 3.6 s and 2.9 s, fifteen minutes after a restart, both under Files hashing
// copies with fs.createReadStream (main/files-place.mts bytesOf). Files kept
// its fingerprints only in memory, so every restart read a project's copies
// again: the store holds 6,697 fingerprinted files, 12 GB, 182 over 10 MB. A
// read stream gives each 64 KB its own new buffer, and that garbage is what
// the thread spent the seconds collecting. Measured in the app's Electron with
// a 1 GB film set and a 117 MB live heap (scripts/scratch/hash-gc.mjs): the
// stream took 13 to 16 s and held the thread up to 457 ms; one reused buffer
// took 1.5 to 4 s and held it at most 268 ms. Files now uses the version
// line's fingerprints, which are saved on disk, and both read through one buffer.
import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { appFilesPlace } from '../main/files-place.mts';
import { hashBytesOf } from '../main/hash-bytes.mts';

const PNG = (n: number) => Buffer.from(`89504e470d0a1a0a0000000d49484452000000${String(n).padStart(2, '0')}`, 'hex');
const COPIES = 6;

let store: Store, storeRoot: string, accountRoot: string, dir: string;
let threads: Array<{ id: string; files: Array<{ saved: string; name: string }> }>;
const note = (id: string, file: string, text: string) => ({ do: 'note', id, file, place: { kind: 'pin', x: 0.2, y: 0.3 }, text });
const open = () => appFilesPlace({ store, team: null, accountRoot, storeRoot });
const asks = (place: ReturnType<typeof open>, t: typeof threads[number]) =>
  place.sameFiles({ product: 'website', id: t.id, copies: t.files.map(({ saved, name }) => ({ path: `attachments/${saved}`, file: name })) });
const attachment = (saved: string) => path.join(dir, 'attachments', saved);

// Every time a copy's bytes are read, by any path in node:fs.
let reads: string[];
const counted = (file: unknown) => { if (String(file).includes(`${path.sep}attachments${path.sep}`)) reads.push(String(file)); };

beforeEach(async () => {
  disk._internals.forgetFolds();
  storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fingerprint-once-'));
  accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(path.join(accountRoot, 'website'), { recursive: true });
  fs.writeFileSync(path.join(accountRoot, 'website', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'website', name: 'website' }));
  store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  dir = path.join(accountRoot, 'website');
  fs.mkdirSync(path.join(dir, 'attachments'), { recursive: true });
  threads = [];
  for (const who of ['a', 'b']) {
    const t = await store.composeItem('website', { title: `Thread ${who}`, body: 'x' });
    const files = Array.from({ length: COPIES }, (_, i) => ({ saved: `mvwy00${i}${who}-${who}${who}-shot-${i}.png`, name: `shot-${i}.png`, i }));
    for (const f of files) fs.writeFileSync(attachment(f.saved), PNG(f.i));
    await disk.updateWorkItem(dir, t.id, { body: files.map((f) => `[${f.name}](attachments/${f.saved})`).join(' ') }, { source: 'founder' });
    threads.push({ id: t.id, files });
  }
  store.fileMark('website', threads[0].id, note('n-0', 'shot-0.png', 'On the first'));
  // Old enough that a fingerprint taken now is trusted after a restart.
  const old = new Date(Date.now() - 60_000);
  for (const t of threads) for (const f of t.files) fs.utimesSync(attachment(f.saved), old, old);
  reads = [];
  const realOpen = fs.promises.open;
  vi.spyOn(fs.promises, 'open').mockImplementation(((file: fs.PathLike, ...rest: unknown[]) => { counted(file); return (realOpen as (...a: unknown[]) => unknown)(file, ...rest); }) as typeof fs.promises.open);
  const realStream = fs.createReadStream;
  vi.spyOn(fs, 'createReadStream').mockImplementation(((file: fs.PathLike, ...rest: unknown[]) => { counted(file); return (realStream as (...a: unknown[]) => unknown)(file, ...rest); }) as typeof fs.createReadStream);
});
afterEach(() => { vi.restoreAllMocks(); });

// The version line writes its fingerprints a moment after it takes them.
async function fingerprintsSaved(): Promise<void> {
  const saved = () => fs.readdirSync(storeRoot, { recursive: true }).some((n) => String(n).endsWith('version-hashes.json'));
  for (let i = 0; i < 40 && !saved(); i += 1) await new Promise((r) => setTimeout(r, 100));
}

it('after a restart the copies are matched without reading any of them again', async () => {
  const first = await asks(open(), threads[1]);
  expect(first[0].notes.map((n) => n.id)).toEqual(['n-0']);
  expect(reads.length).toBeGreaterThan(0);
  await fingerprintsSaved();
  reads = [];
  const again = await asks(open(), threads[1]);
  expect(again[0].notes.map((n) => n.id)).toEqual(['n-0']);
  // Before: every copy read again, 2 x 6.
  expect(reads).toEqual([]);
}, 15_000);

it('a copy redrawn while the app was closed is read again and no longer joins', async () => {
  store.fileMark('website', threads[0].id, note('n-3', 'shot-3.png', 'On the old one'));
  const before = await asks(open(), threads[1]);
  expect(before[3].notes.map((n) => n.id)).toEqual(['n-3']);
  await fingerprintsSaved();
  const redrawn = attachment(threads[1].files[3].saved);
  fs.writeFileSync(redrawn, PNG(99));
  reads = [];
  const after = await asks(open(), threads[1]);
  expect(after[3].notes).toEqual([]);
  expect(after[0].notes.map((n) => n.id)).toEqual(['n-0']);
  expect(reads).toContain(redrawn);
}, 15_000);

it('no file is fingerprinted through a read stream', async () => {
  const streams = vi.mocked(fs.createReadStream);
  await asks(open(), threads[1]);
  expect(streams).not.toHaveBeenCalled();
});

it.each([
  ['an empty file', 0],
  ['one byte', 1],
  ['exactly one piece', 1 << 20],
  ['one byte over a piece', (1 << 20) + 1],
  ['several pieces and a bit', 3 * (1 << 20) + 777],
])('the fingerprint of %s is the sha256 of its bytes', async (_label, size) => {
  const file = path.join(storeRoot, `bytes-${size}`);
  const bytes = crypto.randomBytes(size);
  fs.writeFileSync(file, bytes);
  expect(await hashBytesOf(file)).toBe(crypto.createHash('sha256').update(bytes).digest('hex'));
});

it('two files that differ in their last byte get different fingerprints', async () => {
  const bytes = crypto.randomBytes((1 << 20) + 5);
  const a = path.join(storeRoot, 'a.bin'); const b = path.join(storeRoot, 'b.bin');
  fs.writeFileSync(a, bytes);
  bytes[bytes.length - 1] ^= 1;
  fs.writeFileSync(b, bytes);
  expect(await hashBytesOf(a)).not.toBe(await hashBytesOf(b));
});

it('a file that is not there is an error, not a fingerprint', async () => {
  await expect(hashBytesOf(path.join(storeRoot, 'gone.bin'))).rejects.toThrow();
});
