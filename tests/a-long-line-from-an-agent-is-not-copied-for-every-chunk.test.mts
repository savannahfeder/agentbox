// The app's main process made about 1.8 GB of garbage every two minutes on
// 2026-11-15 (a sampling heap profile of the running app), and with the Mac in
// swap each collection of it froze the window: 1,775 stalls over 500 ms in one
// hour. The largest share, about 435 MB, was agents' output being split into
// lines: each reader grew one string with every chunk and searched it from the
// start, so a long line (a tool result of a few MB) was copied again for every
// 64 KB that arrived. One 4 MB line took 87 ms that way against 2.5 ms
// searching only the new chunk, and three readers in main did it to each line.
//
// The readers now share one splitter that searches only the newest chunk and
// joins a line's pieces once.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { streamLines } from '../main/stream-lines.mts';

const collect = () => { const lines: string[] = []; const feed = streamLines((l) => lines.push(l)); return { lines, feed }; };

describe('splitting a stream into lines', () => {
  it('hands over each line once its newline arrives, however it was chunked', () => {
    const { lines, feed } = collect();
    feed('{"a":1}\n{"b"'); feed(':2}'); feed('\n{"c":3}\n');
    expect(lines).toEqual(['{"a":1}', '{"b":2}', '{"c":3}']);
  });

  it('keeps a partial line back until it ends, and says how long it is', () => {
    const { lines, feed } = collect();
    feed('abc'); feed('def');
    expect(lines).toEqual([]);
    expect(feed.held()).toBe(6);
    feed('\n');
    expect(lines).toEqual(['abcdef']);
    expect(feed.held()).toBe(0);
  });

  it('passes empty lines on, for the reader to decide about', () => {
    const { lines, feed } = collect();
    feed('a\n\nb\n');
    expect(lines).toEqual(['a', '', 'b']);
  });

  it('decodes a character split across two chunks', () => {
    const { lines, feed } = collect();
    const bytes = Buffer.from('café ✓\n');
    feed(bytes.subarray(0, 4)); feed(bytes.subarray(4, 7)); feed(bytes.subarray(7));
    expect(lines).toEqual(['café ✓']);
  });

  it('puts a line arriving in many pieces back together exactly', () => {
    const { lines, feed } = collect();
    const big = 'x'.repeat(1_000_000) + 'end';
    for (let i = 0; i < big.length; i += 65536) feed(Buffer.from(big.slice(i, i + 65536)));
    feed('\nnext\n');
    expect(lines.length).toBe(2);
    expect(lines[0].length).toBe(big.length);
    expect(lines[0].endsWith('end')).toBe(true);
    expect(lines[1]).toBe('next');
  });

  it('lets a reader feed more while it is handling a line', () => {
    const lines: string[] = [];
    const feed = streamLines((l) => { lines.push(l); if (l === 'first') feed('inner\n'); });
    feed('first\nsecond\n');
    expect(lines).toEqual(['first', 'inner', 'second']);
  });
});

describe("main's readers of agents' output", () => {
  const root = path.resolve(import.meta.dirname, '..');
  const READERS = ['main/harnesses/claude.mts', 'main/claude-input.mts', 'main/hosted-run.mts', 'main/codex-app-server.mts'];

  it.each(READERS)('%s splits with the shared splitter, not a growing buffer', (file) => {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    expect(src).toMatch(/streamLines\(/);
    expect(src).not.toMatch(/\b(buffer|buf)\s*\+=/);
  });
});
