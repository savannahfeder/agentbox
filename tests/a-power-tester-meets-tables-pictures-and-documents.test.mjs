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

const named = (result) => result.split('\n').filter((l) => /^[\w/.-]+\.(csv|md|html|png)$/.test(l));

describe('the threads a power test seeds with files', () => {
  const accountRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-files-'));
  const picture = path.join(accountRoot, 'shot.png');
  fs.writeFileSync(picture, 'png');
  const lines = seedArtifacts({ accountRoot, slug: 'product', picture, now: 1_800_000_000_000 });
  const results = lines.filter((l) => l.patch.result).map((l) => l.patch.result);

  it('answer with one file each, of every kind, and every file is there', () => {
    const files = results.flatMap(named);
    expect(files.map((f) => path.extname(f)).sort()).toEqual(['.csv', '.html', '.md', '.png']);
    for (const f of files) expect(fs.existsSync(path.join(accountRoot, 'product', f))).toBe(true);
  });

  it('are open and answered, so they wait in Needs you', () => {
    const opened = lines.filter((l) => l.patch.status);
    expect(opened.every((l) => l.patch.status === 'open')).toBe(true);
    expect(results).toHaveLength(opened.length);
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
