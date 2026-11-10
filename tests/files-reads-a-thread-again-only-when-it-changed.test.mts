// FILES READS A THREAD AGAIN ONLY WHEN IT CHANGED.
//
// With the Files place on, the whole app slowed until it was "basically not
// usable" (2026-11-01). Every list of Files, and every open thread's strip of
// files on every change anywhere in the app, rebuilt the file list from every
// thread: each thread's lines parsed for files and marks again, and each file
// compared with every other file of any name, with a disk check inside that
// loop. A store with thousands of threads and an agent writing a line a second
// kept the main process busy. Measured here by counting the parses.
import { describe, it, expect } from 'vitest';
import { filesOf, filesOfInternals } from '../main/files-place.mts';

const thread = (i, extra = []) => ({
  ref: { kind: 'thread', product: 'company', id: `w-${i}` },
  title: `Thread ${i}`,
  project: 'Company',
  dirs: [],
  lines: [
    { ts: 1000 + i, source: 'founder', patch: { body: `Draft the plan ${i}` } },
    { ts: 2000 + i, source: 'agent', patch: { result: `Here it is: [plan-${i}.md](plan-${i}.md)` } },
    ...extra,
  ],
});

describe('reading threads for their files', () => {
  it('parses each thread once, and not again while nothing changed', () => {
    const threads = Array.from({ length: 40 }, (_, i) => thread(i));
    const before = filesOfInternals.parses;
    const first = filesOf(threads);
    expect(filesOfInternals.parses - before).toBe(40);
    const second = filesOf(threads.map((t) => ({ ...t, lines: [...t.lines] })));
    expect(filesOfInternals.parses - before).toBe(40);
    expect(first.length).toBe(40);
    expect(second.map((f) => f.key)).toEqual(first.map((f) => f.key));
  });

  it('parses again only the thread that said more', () => {
    const threads = Array.from({ length: 40 }, (_, i) => thread(100 + i));
    filesOf(threads);
    const before = filesOfInternals.parses;
    threads[7] = thread(107, [{ ts: 9999, source: 'agent', patch: { result: 'Also [notes-107.md](notes-107.md)' } }]);
    const files = filesOf(threads);
    expect(filesOfInternals.parses - before).toBe(1);
    expect(files.some((f) => f.name === 'notes-107.md')).toBe(true);
  });

  it('an open thread\'s strip of files asks for their numbers only when the thread says more', async () => {
    const fs = await import('node:fs');
    const strip = fs.readFileSync(new URL('../renderer/src/components/ThreadArtifacts.tsx', import.meta.url), 'utf8');
    expect(strip).toMatch(/useFileLine\(item\.product, item\.id, lines\.length, false\)/);
    const place = fs.readFileSync(new URL('../main/files-place.mts', import.meta.url), 'utf8');
    expect(place).not.toMatch(/filesOf\(threads\(\)\)/);
  });

  it('a thread whose lines are the same length but newer is read again', () => {
    const a = thread(200);
    filesOf([a]);
    const before = filesOfInternals.parses;
    const edited = { ...a, lines: [a.lines[0], { ts: 5000, source: 'agent', patch: { result: 'Here: [other-200.md](other-200.md)' } }] };
    filesOf([edited]);
    expect(filesOfInternals.parses - before).toBe(1);
  });
});
