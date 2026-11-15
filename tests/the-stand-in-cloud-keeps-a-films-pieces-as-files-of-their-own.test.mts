// A shared film's pieces are Buffers in the stand-in cloud, and its saver wrote
// each one into cloud.json as a list of numbers, every 3 seconds. Two films of
// 3 MB and 17 MB made a 42 MB cloud.json, and the stand-in sat at 72% CPU and
// 1.3 GB, slowing every copy on the team loop (2026-11-09).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { pack, unpack } from '../cloud/standin/server.mjs';

const dirs: string[] = [];
const blobsDir = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'standin-blobs-')); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

test('a piece goes to a file of its own and comes back as the same bytes', () => {
  const blobs = blobsDir();
  const bytes = Buffer.alloc(2 * 1024 * 1024, 7);
  const saved = JSON.stringify(pack({ linkPieces: new Map([['t/h/0', { owner: 'p', bytes }]]) }, blobs));
  expect(saved.length).toBeLessThan(1000);
  const back = unpack(JSON.parse(saved), blobs) as { linkPieces: Map<string, { bytes: Buffer }> };
  const got = back.linkPieces.get('t/h/0')!.bytes;
  expect(Buffer.isBuffer(got)).toBe(true);
  expect(got.equals(bytes)).toBe(true);
});

test('a small piece is kept the same way, and a short string stays in the file', () => {
  const blobs = blobsDir();
  const saved = pack({ tiny: Buffer.from([1, 2, 3]), word: 'hello' }, blobs) as Record<string, unknown>;
  expect(saved.word).toBe('hello');
  const back = unpack(JSON.parse(JSON.stringify(saved)), blobs) as { tiny: Buffer; word: string };
  expect([...back.tiny]).toEqual([1, 2, 3]);
  expect(back.word).toBe('hello');
});
