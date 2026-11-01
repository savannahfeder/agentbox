// A CARD FOR V4 OPENS V4 EVEN WHEN V8 EXISTS.
//
// The "october-investor-update-v6.md" card opened "v3 of 3"
// (Dev), the same file was "v7 of 7" in Files and "v4 of 4" from its thread
// (Maya), and Sofia's "group-seat-picker.png, v6" opened an older picture.
// Measured from the code: the thread's view numbered only the versions its
// own lines named, and a card naming the thread's newest jumped to the newest
// made anywhere. The view now numbers every version by the file's one line,
// opens the version the card names, and says which is the newest.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { filesInLines, threadFiles, whereAPressLands } from '../shared/artifact-marks.mjs';

const said = (ts, note, extra = {}) => ({ ts, source: 'agent', patch: { note, ...extra } });

// The thread made v4 and v6; the rest were made on other threads.
const lines = [
  said(1, 'Saved [update-v4.md](designs/update-v4.md)'),
  said(2, 'Saved [update-v6.md](designs/update-v6.md)'),
  ...[1, 2, 3, 5, 7, 8].map((n) => said(10 + n, `[update.md](/kept/${n}/update.md)`, { newer: true })),
];
const numbers = { 'designs/update-v4.md': 4, 'designs/update-v6.md': 6, ...Object.fromEntries([1, 2, 3, 5, 7, 8].map((n) => [`/kept/${n}/update.md`, n])) };
const families = threadFiles(filesInLines(lines), numbers);

describe("a thread's file, numbered by its line", () => {
  it('counts every version the line holds, in the line\'s order', () => {
    expect(families).toHaveLength(1);
    expect(families[0].versions.map((v) => v.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('a card for v4 opens v4, not the newest', () => {
    const at = whereAPressLands(families, { path: 'designs/update-v4.md' });
    expect(families[at.fi].versions[at.vi].n).toBe(4);
  });

  it("a card for the thread's own newest opens it, though v8 was made since", () => {
    const at = whereAPressLands(families, { path: 'designs/update-v6.md' });
    expect(families[at.fi].versions[at.vi].n).toBe(6);
  });

  it('opening with no card opens the newest', () => {
    const at = whereAPressLands(families, {});
    expect(families[at.fi].versions[at.vi].n).toBe(8);
  });

  it('a name the thread said that the line never had is no version', () => {
    const more = threadFiles(filesInLines([...lines, said(30, 'Will save [update-v9.md](designs/update-v9.md)')]), numbers);
    expect(more[0].versions.map((v) => v.name)).not.toContain('update-v9.md');
    expect(more[0].versions).toHaveLength(8);
  });

  it('with no line yet, the thread counts as it always did', () => {
    expect(threadFiles(filesInLines(lines.slice(0, 2)))[0].versions.map((v) => v.n)).toEqual([1, 2]);
  });
});

describe('the big view', () => {
  const view = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/components/ArtifactView.tsx'), 'utf8');
  it('lands through the one rule, and says which version is the newest', () => {
    expect(view).toContain('whereAPressLands(families,');
    expect(view).toMatch(/is the newest/);
  });
  const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
  it("a thread's view reads the file's line, not only its own lines", () => {
    expect(read('renderer/src/components/ThreadArtifacts.tsx')).toContain('useFileLine(');
    expect(read('renderer/src/file-numbers.ts')).toContain('api.fileLine(');
  });
});
