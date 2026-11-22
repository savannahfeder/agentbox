// THE PHONE APP SAYS ITS LABELS IN PLAIN CASE (2026-11-22). Section labels,
// project names and headings inside an answer were uppercase, letter-spaced
// and mostly mono at 10 to 12px, the desktop's look at phone width, which read
// as a terminal rather than an app. Part of "a redesign of everything".
// Measured by counting `textTransform: 'uppercase'` in mobile/src: 16.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : []));
const all = files('mobile/src');

describe('a label on the phone', () => {
  it('is never forced to uppercase', () => {
    expect(all.filter((f) => /textTransform: 'uppercase'/.test(fs.readFileSync(f, 'utf8')))).toEqual([]);
  });
  it('is not smaller than 12px where it used to be a mono cap', () => {
    for (const f of all) expect(fs.readFileSync(f, 'utf8'), f).not.toMatch(/fontFamily: font\.mono, fontSize: 1[01](\.\d)?, (lineHeight: [\d.]+, )?letterSpacing/);
  });
});

describe('a heading inside an answer', () => {
  const md = fs.readFileSync('mobile/src/ui/Markdown.tsx', 'utf8');
  it('is larger and heavier than the words, both in the heavy weight', () => {
    expect(md).toMatch(/1: \{ fontSize: 2\d, [^\n]*fontFamily: font\.semibold/);
    expect(md).toMatch(/2: \{ fontSize: 19, [^\n]*fontFamily: font\.semibold/);
  });
});

describe('code', () => {
  it('stays in the mono face', () => {
    expect(fs.readFileSync('mobile/src/ui/Markdown.tsx', 'utf8')).toMatch(/font\.mono/);
  });
});
