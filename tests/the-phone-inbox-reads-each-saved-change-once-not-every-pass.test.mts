// THE PHONE INBOX READS EACH SAVED CHANGE ONCE, NOT ON EVERY PASS.
//
// 2026-11-16 the app's freeze log put 594 s of main-process freezes, in 925
// stalls, in readChange under the phone inbox's publish (changeOf ->
// readChangeSummary), and the main process's heap swung between 0.4 and 1.7 GB
// all day while its footprint climbed from 1.2 to 4.5 GB. The phone carries the
// newest 300 threads of a project, and 417 of one project's threads had a saved
// change (the biggest 61 MB). The summary cache kept 200 and was refilled in
// the order it was read, so a pass over more than 200 changes in the same order
// pushed out each one just before it was asked for again: every pass parsed
// every change in full. Summaries are small (400 of them came to 4 MB), so the
// cache now holds what the phone carries and keeps the ones still being read.

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readChangeSummary } from '../main/code-change.mts';
import { SNAPSHOT_LIMITS } from '../shared/phone-snapshot.mts';

const change = (i: number) => JSON.stringify({
  item: `w-${i}`,
  files: [{ path: `src/f${i}.mts`, plus: 1, minus: 0, hunks: [{ rows: [['+', 'x']], plus: 1, minus: 0 }] }],
  roots: ['/repo'], plus: 1, minus: 0, editCount: 1, withProse: 0,
  committed: true, uncommitted: false, knowsYou: true, fromDisk: 1,
});

let dir: string;
let n = 0;
const files = (count: number) => Array.from({ length: count }, () => {
  const file = path.join(dir, `c${n}.change`);
  fs.writeFileSync(file, change(n++));
  return file;
});
const readsWhile = (fn: () => void) => {
  const spy = vi.spyOn(fs, 'readFileSync');
  try { fn(); return spy.mock.calls.length; } finally { spy.mockRestore(); }
};

beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-changes-')); });
afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); });
afterEach(() => vi.restoreAllMocks());

describe('reading the same saved changes pass after pass', () => {
  it('reads none of them again when the phone carries its most threads', () => {
    const carried = files(SNAPSHOT_LIMITS.items);
    for (const f of carried) readChangeSummary(f);
    expect(readsWhile(() => { for (const f of carried) readChangeSummary(f); })).toBe(0);
  });

  it('reads none again across several projects of carried threads', () => {
    const carried = files(SNAPSHOT_LIMITS.items * 4);
    for (const f of carried) readChangeSummary(f);
    expect(readsWhile(() => { for (const f of carried) readChangeSummary(f); })).toBe(0);
  });

  it('still reads a change again once it has been rewritten', () => {
    const [f] = files(1);
    readChangeSummary(f);
    fs.writeFileSync(f, change(99_999));
    fs.utimesSync(f, new Date(Date.now() + 5000), new Date(Date.now() + 5000));
    expect(readsWhile(() => { readChangeSummary(f); })).toBe(1);
  });
});

describe('the cache stays bounded', () => {
  it('lets go of a change nobody has read since thousands of others', () => {
    const [old] = files(1);
    readChangeSummary(old);
    for (const f of files(5000)) readChangeSummary(f);
    expect(readsWhile(() => { readChangeSummary(old); })).toBe(1);
  });

  it('keeps a change that is still being read, however long ago it was first read', () => {
    const [kept] = files(1);
    readChangeSummary(kept);
    const others = files(5000);
    // Each new one is read once; the kept one never again.
    expect(readsWhile(() => { for (const f of others) { readChangeSummary(f); readChangeSummary(kept); } })).toBe(others.length);
  });
});
