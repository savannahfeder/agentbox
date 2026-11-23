// A big file is read for secrets without freezing the app.
//
// 2026-11-23: in the hour after a restart the app froze six times for 6.9
// seconds in all, and four of those, 1.2 to 1.5 seconds each, were 94 to 96%
// inside one pattern: the one that finds file paths in a file bound for the
// phone, so a long file name is not taken for a key. It tried a path at every
// character, 300 characters forward and back again, so text in long unbroken
// runs (hex, or a page with its pictures written into it) cost about 600 steps
// a character: 163 ms of processor for 256 KB of hex, against 20 ms for a
// megabyte of plain words.
import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { filePathSpans, hideSecrets } from '../shared/phone-snapshot.mts';

// The pattern as it was: what the spans must still be, character for character.
const AS_IT_WAS = /[\w./~-]{0,300}\.(?:png|jpe?g|gif|webp|heic|svg|mp4|mov|webm|m4a|mp3|wav|pdf|txt|md|html?|csv|json|zip)(?![\w])/gi;
const spansAsItWas = (text: string): [number, number][] => [...text.matchAll(AS_IT_WAS)].map((m) => [m.index, m.index + m[0].length]);

// Processor time, not the clock: several agents share the Mac this runs on.
const cpuMs = (fn: () => unknown): number => {
  const from = process.cpuUsage();
  fn();
  const used = process.cpuUsage(from);
  return (used.user + used.system) / 1000;
};

// The same strings every run.
function seeded(seed: number) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}
const PIECES = ['a', 'B', '7', '_', '-', '.', '/', '~', ' ', '+', '=', '"', '\n', '(', ')', ':', 'é', '日', 'ſ', 'K', '.ſvg',
  '.png', '.PNG', '.md', '.mdx', '.htm', '.html', '.htmlx', '.jpg', '.jpeg', '.jpe', '.json', '.zip', '.pngs', '.png.md',
  'designs/w-1/', 'XyZ12abcDEF34ghiJKL56mnoPQR78stuVW'];
function someText(rand: () => number): string {
  let out = '';
  const pieces = 1 + Math.floor(rand() * 40);
  for (let n = 0; n < pieces; n += 1) {
    const piece = PIECES[Math.floor(rand() * PIECES.length)]!;
    // Runs on both sides of the 300 the pattern reaches back.
    const times = rand() < 0.15 ? [1, 250, 299, 300, 301, 340, 620][Math.floor(rand() * 7)]! : 1;
    out += piece.length === 1 ? piece.repeat(times) : piece;
  }
  return out;
}

describe('a big file read for secrets', () => {
  it('costs a 2 MB unbroken run a fraction of what it did', () => {
    const hex = crypto.randomBytes(1024 * 1024).toString('hex');
    // 1.3 s of processor before; about 20 ms now.
    expect(cpuMs(() => hideSecrets(hex))).toBeLessThan(400);
  });

  it('costs a page with a 3 MB picture written into it a fraction of what it did', () => {
    const page = `<h1>Report</h1>\n<img src="data:image/png;base64,${crypto.randomBytes(3 * 768 * 1024).toString('base64')}">\n<p>Done.</p>`;
    let out = '';
    // 0.5 s of processor before.
    expect(cpuMs(() => { out = hideSecrets(page); })).toBeLessThan(250);
    expect(out.startsWith('<h1>Report</h1>')).toBe(true);
  });
});

describe('where a file path is found', () => {
  it('is where the pattern found it, for every mix of runs, dots and endings', () => {
    const rand = seeded(20261123);
    for (let n = 0; n < 4000; n += 1) {
      const text = someText(rand);
      expect(filePathSpans(text), JSON.stringify(text)).toEqual(spansAsItWas(text));
    }
  });

  it('reaches back 300 characters from the ending and no further', () => {
    const at = (lead: number) => filePathSpans(`${'a'.repeat(lead)}.png`);
    expect(at(299)).toEqual([[0, 303]]);
    expect(at(300)).toEqual([[0, 304]]);
    expect(at(301)).toEqual([[1, 305]]);
  });

  it('takes the last ending within reach, and starts again after it', () => {
    expect(filePathSpans('a.png.md b.pngs c.jpeg')).toEqual(spansAsItWas('a.png.md b.pngs c.jpeg'));
    expect(filePathSpans('a.png.md b.pngs c.jpeg')).toEqual([[0, 8], [16, 22]]);
  });

  it('finds none where a name only looks like an ending', () => {
    for (const text of ['notes.mdx', 'a.pngs', 'page.htmlx', 'no dots here at all', '']) expect(filePathSpans(text), text).toEqual([]);
  });
});

describe('what is hidden and what is spared', () => {
  const key = 'XyZ12abcDEF34ghiJKL56mnoPQR78stuVW';

  it('still spares a long file name, and still hides a bare key', () => {
    const name = 'attachments/d271780fa97efb10-4A7B3C2D-1E5F-4A6B-8C9D-0E1F2A3B4C5D.png';
    expect(hideSecrets(`![shot](${name}) and ${key}`)).toBe(`![shot](${name}) and [hidden]`);
  });

  it('still hides a key further than 300 characters before a file ending', () => {
    const far = `${key}/${'a'.repeat(300)}.png`;
    expect(hideSecrets(far)).toBe(`[hidden]/${'a'.repeat(300)}.png`);
  });

  it('still hides a key beside a megabyte of hex', () => {
    const hex = crypto.randomBytes(512 * 1024).toString('hex');
    expect(hideSecrets(`${hex} ${key} ${hex}`)).toBe(`${hex} [hidden] ${hex}`);
  });
});
