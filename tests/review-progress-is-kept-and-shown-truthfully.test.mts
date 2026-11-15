// WHAT YOU DID IN A CHANGE IS KEPT, AND WHAT THE SCREEN SHOWS IS TRUE.
//
// Four faults from the GPT-6.1-Sol tester's second round, 2026-10-04, each
// measured in the app's own Electron on a real change:
//
// 1. Typing R2_MARKER into a line, folding the file and opening it again drew
//    the ORIGINAL line, while Cmd+S still saved the marker. The screen lied
//    about what would be written.
// 2. A removed line could not be selected: double-clicking a deleted word
//    selected nothing and a copy pasted the previous clipboard. The window's
//    body is `user-select: none`, and a removed line, being read only, had
//    never opted back in.
// 3. During a big change's fill, clicking a file in the tree and pressing End
//    marked README.md while the code stayed at the top, three times in three.
//    The key that asked for the jump also reached the listener that cancels a
//    jump when her own hand takes over, and which ran first depended on the
//    order React had last attached them in.
// 4. Folding files to mark them done was forgotten the moment the pane closed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { foldsFor } from '../renderer/src/code-artifact.ts';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tsx = fs.readFileSync(path.join(root, 'renderer', 'src', 'components', 'CodeArtifact.tsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'renderer', 'src', 'styles.css'), 'utf8');

describe('1. a file opened again shows what she typed', () => {
  it('re-reads her unsaved lines when a folded file opens', () => {
    const fold = tsx.slice(tsx.indexOf('const foldFile = '), tsx.indexOf('const foldFile = ') + 1200);
    expect(fold).toMatch(/seeded\.current\.set\(path,/);
    expect(fold).toMatch(/edits\.current\.get\(path\)/);
  });
});

describe('2. every line of code can be selected', () => {
  it('opts the code back in to selection, whatever the body says', () => {
    expect(css).toMatch(/^\.code-line \{[^}]*user-select: text/m);
  });

  it('keeps the gutter out of it', () => {
    expect(css).toMatch(/^\.code-num \{[^}]*user-select: none/m);
  });
});

describe('3. a jump she asked for is not cancelled by the key that asked', () => {
  it('only lets a key she pressed for something else cancel a jump', () => {
    expect(tsx).toMatch(/const releaseKey = \(e: KeyboardEvent\) => \{ if \(!e\.defaultPrevented\) holding\.current = null; \};/);
    expect(tsx).toMatch(/window\.addEventListener\('keydown', releaseKey\)/);
    expect(tsx).not.toMatch(/window\.addEventListener\('keydown', release\)/);
  });
});

describe('4. folds are remembered for the change while the app runs', () => {
  it('hands back the same set for the same change', () => {
    const a = foldsFor('p', 'runs/w-1/the-change-it-made.change');
    a.add('src/a.ts');
    expect([...foldsFor('p', 'runs/w-1/the-change-it-made.change')]).toEqual(['src/a.ts']);
  });

  it('keeps two changes apart, and two products apart', () => {
    foldsFor('p', 'runs/w-2/the-change-it-made.change').add('x.ts');
    expect([...foldsFor('p', 'runs/w-3/the-change-it-made.change')]).toEqual([]);
    expect([...foldsFor('q', 'runs/w-2/the-change-it-made.change')]).toEqual([]);
  });

  it('is where the pane starts from and writes to', () => {
    expect(tsx).toMatch(/foldsFor\(product, src\)/);
  });
});
