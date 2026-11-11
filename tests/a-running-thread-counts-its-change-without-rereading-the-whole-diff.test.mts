// A RUNNING THREAD COUNTS ITS CHANGE WITHOUT REREADING THE WHOLE DIFF.
//
// 2026-11-09 the Mac swapped from 7 GB to 15 GB in four minutes and froze. The
// app's freeze log from that minute has its main process in garbage collection,
// called from readChange (main/code-change.mts) under the zero:code-change
// handler, again and again. Saved changes on that Mac reached 53 MB (2,836
// files in one), and an open thread re-read the whole file on every write any
// agent made and every few seconds, only to list file names, count lines and
// read the three ship facts. Each read parsed the file in the main process and
// cloned it into the window.
//
// Now those readers ask for a summary without the diff's rows, worked out once
// per version of the file; the panes that draw the diff still get all of it.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readChange, readChangeSummary } from '../main/code-change.mts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

function bigChange(files: number) {
  const rows = Array.from({ length: 200 }, (_, i) => ['+', `const line${i} = ${'x'.repeat(60)};`]);
  return {
    item: 'w-big',
    files: Array.from({ length: files }, (_, i) => ({
      path: `src/file-${i}.mts`, abs: `/repo/src/file-${i}.mts`, plus: 200, minus: 0, fromDisk: true,
      hunks: [{ rows, plus: 200, minus: 0 }],
    })),
    roots: ['/repo'], plus: files * 200, minus: 0, editCount: 0, withProse: 0,
    committed: true, uncommitted: false, knowsYou: true, fromDisk: files,
  };
}

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'change-summary-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('the summary of a saved change', () => {
  it('keeps every file, the counts and the ship facts, and none of the rows', () => {
    const file = path.join(dir, 'the-change-it-made.change');
    fs.writeFileSync(file, JSON.stringify(bigChange(3)));
    const s = readChangeSummary(file);
    expect(s.files.map((f) => f.path)).toEqual(['src/file-0.mts', 'src/file-1.mts', 'src/file-2.mts']);
    expect(s.files[0]).toEqual({ path: 'src/file-0.mts', abs: '/repo/src/file-0.mts', plus: 200, minus: 0, fromDisk: true });
    expect(s).toMatchObject({ plus: 600, minus: 0, committed: true, uncommitted: false, knowsYou: true });
    expect(JSON.stringify(s)).not.toContain('hunks');
  });

  it('is a small fraction of a big change', () => {
    const file = path.join(dir, 'the-change-it-made.change');
    fs.writeFileSync(file, JSON.stringify(bigChange(2000)));
    const full = fs.statSync(file).size;
    expect(full).toBeGreaterThan(20 * 1024 * 1024);
    expect(JSON.stringify(readChangeSummary(file)).length).toBeLessThan(full / 100);
  });

  it('is not read off the disk again while the file has not changed', () => {
    const file = path.join(dir, 'the-change-it-made.change');
    const text = JSON.stringify(bigChange(2));
    fs.writeFileSync(file, text);
    const mtime = new Date(Math.floor(Date.now() / 1000) * 1000);
    fs.utimesSync(file, mtime, mtime);
    const first = readChangeSummary(file);
    // Same size, same time, unreadable contents: only a reread would notice.
    fs.writeFileSync(file, '#'.repeat(Buffer.byteLength(text)));
    fs.utimesSync(file, mtime, mtime);
    expect(readChangeSummary(file)).toEqual(first);
  });

  it('is read again once the run writes a new change', () => {
    const file = path.join(dir, 'the-change-it-made.change');
    fs.writeFileSync(file, JSON.stringify(bigChange(2)));
    expect(readChangeSummary(file).files).toHaveLength(2);
    fs.writeFileSync(file, JSON.stringify(bigChange(5)));
    fs.utimesSync(file, new Date(Date.now() + 5000), new Date(Date.now() + 5000));
    expect(readChangeSummary(file).files).toHaveLength(5);
  });

  it('refuses a file that is not a change, as the full read does', () => {
    const file = path.join(dir, 'not-a-change.change');
    fs.writeFileSync(file, '{"hello":1}');
    expect(() => readChange(file)).toThrow(/not a change/);
    expect(() => readChangeSummary(file)).toThrow(/not a change/);
  });
});

describe('who asks for which', () => {
  it('the handler answers a summary when asked for one', () => {
    const ipc = source('main/ipc.mts');
    expect(ipc).toMatch(/summary \? readChangeSummary\(found\.path\) : readChange\(found\.path\)/);
  });

  it('the readers that poll or only count ask for the summary', () => {
    for (const rel of ['renderer/src/components/ItemThread.tsx', 'renderer/src/components/Focus.tsx', 'renderer/src/file-glance.ts']) {
      const calls = source(rel).match(/codeChange\(\{[^}]*\}\)/g) ?? [];
      expect(calls.length, rel).toBeGreaterThan(0);
      for (const call of calls) expect(call, rel).toContain('summary: true');
    }
  });

  it('the panes that draw the diff still get all of it', () => {
    for (const rel of ['renderer/src/components/DirectReview.tsx', 'renderer/src/components/DocPane.tsx', 'renderer/src/components/ArtifactThumbnail.tsx']) {
      const calls = source(rel).match(/codeChange\(\{[^}]*\}\)/g) ?? [];
      expect(calls.length, rel).toBeGreaterThan(0);
      for (const call of calls) expect(call, rel).not.toContain('summary');
    }
  });
});
