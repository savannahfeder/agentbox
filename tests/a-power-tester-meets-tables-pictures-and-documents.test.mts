// A power test before a release was asked to cover the new tables, pictures
// and documents beside a thread, but stand-in agents answer in words and the
// seeded old threads all said "Done: <title>.", so no tester could open a file.
// Measured on 2026-11-04: no line seedHistory wrote named a file. A copy with
// old threads now also gets open threads answered with a .csv, a .md, an
// .html and a .png that exist under the project's documents.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { seedArtifacts } = await import('../.claude/skills/power-test/scripts/artifacts.mjs');
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

const named = (result) => result.split('\n').filter((l) => /^[\w/.-]+\.(csv|md|html|png|pdf|mp4)$/.test(l));

// 2026-11-08 (w-375c72d32e): every kind of file opens beside the chat and goes
// full screen in one view, so a tester also meets a PDF, a film, and a picture
// with two versions to step between.
describe('the threads a power test seeds with files', () => {
  const accountRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-files-'));
  const picture = path.join(accountRoot, 'shot.png');
  const picture2 = path.join(accountRoot, 'shot-2.png');
  const film = path.join(accountRoot, 'clip.mp4');
  fs.writeFileSync(picture, 'png');
  fs.writeFileSync(picture2, 'png2');
  fs.writeFileSync(film, 'mp4');
  const lines = seedArtifacts({ accountRoot, slug: 'product', picture, picture2, film, now: 1_800_000_000_000 });
  const results = lines.filter((l) => l.patch.result).map((l) => l.patch.result);

  it('answer with every kind of file, and every file is there', () => {
    const files = results.flatMap(named);
    expect(files.map((f) => path.extname(f)).sort()).toEqual(['.csv', '.html', '.md', '.mp4', '.pdf', '.png', '.png']);
    for (const f of files) expect(fs.existsSync(path.join(accountRoot, 'product', f))).toBe(true);
  });

  it('give the picture a second version on a later answer of the same thread', () => {
    const pictureLines = lines.filter((l) => l.patch.result && /\.png$/m.test(l.patch.result));
    expect(new Set(pictureLines.map((l) => l.id)).size).toBe(1);
    expect(pictureLines.map((l) => named(l.patch.result)[0])).toEqual([expect.stringMatching(/inbox\.png$/), expect.stringMatching(/inbox-v2\.png$/)]);
  });

  it('write a PDF a reader can open', () => {
    const pdf = results.flatMap(named).find((f) => f.endsWith('.pdf'));
    const bytes = fs.readFileSync(path.join(accountRoot, 'product', pdf), 'latin1');
    expect(bytes.startsWith('%PDF-1.4')).toBe(true);
    const xref = Number(/startxref\n(\d+)/.exec(bytes)[1]);
    expect(bytes.slice(xref, xref + 4)).toBe('xref');
  });

  it('leave the film and the second picture out when there are none to copy', () => {
    const without = seedArtifacts({ accountRoot, slug: 'bare', picture, now: 1_800_000_000_000 });
    const files = without.filter((l) => l.patch.result).flatMap((l) => named(l.patch.result));
    expect(files.some((f) => f.endsWith('.mp4'))).toBe(false);
    expect(files.filter((f) => f.endsWith('.png'))).toHaveLength(1);
  });

  it('are open and answered, so they wait in Needs you', () => {
    const opened = lines.filter((l) => l.patch.status);
    expect(opened.every((l) => l.patch.status === 'open')).toBe(true);
    expect(new Set(lines.filter((l) => l.patch.result).map((l) => l.id)).size).toBe(opened.length);
    expect(results.every((r) => r.startsWith('**') && r.includes('## Options'))).toBe(true);
  });

  it('leave the picture out when there is none to copy', () => {
    const without = seedArtifacts({ accountRoot, slug: 'other', picture: null });
    expect(without.filter((l) => l.patch.result).flatMap((l) => named(l.patch.result)).some((f) => f.endsWith('.png'))).toBe(false);
  });

  it('are seeded with the old threads, and counted with them', () => {
    expect(read('.claude/skills/power-test/scripts/power-test.mjs')).toMatch(/for \(const l of withFiles\) ids\.add\(l\.id\);/);
  });
});
