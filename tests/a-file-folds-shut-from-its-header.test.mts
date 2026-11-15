// A FILE FOLDS SHUT FROM ITS HEADER, AND THE TREE SHOWS IT IS DONE WITH.
//
// Found by the GPT-6.1-Sol tester on 2026-10-04: there was no way to finish
// reviewing a file. Clicking or double-clicking its header did nothing, all
// 2,074 rows of a 44-file change stayed open, and nothing said which of the 44
// had been read. GitHub's "Files changed" folds a file from its header and
// marks it viewed; this does the first, and dims the file in the tree so the
// folded ones read as done, with no new control on either row.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { toggled } from '../renderer/src/code-artifact.ts';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tsx = fs.readFileSync(path.join(root, 'renderer', 'src', 'components', 'CodeArtifact.tsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'renderer', 'src', 'styles.css'), 'utf8');

describe('folding a file', () => {
  it('adds a file that was open and takes away one that was shut', () => {
    const one = toggled(new Set(), 'a.ts');
    expect([...one]).toEqual(['a.ts']);
    expect([...toggled(one, 'a.ts')]).toEqual([]);
    expect([...toggled(one, 'b.ts')].sort()).toEqual(['a.ts', 'b.ts']);
  });

  it('never changes the set it was given', () => {
    const one = new Set(['a.ts']);
    toggled(one, 'a.ts');
    expect([...one]).toEqual(['a.ts']);
  });
});

describe('the pane', () => {
  it('folds from a press on the header', () => {
    const head = tsx.slice(tsx.indexOf('className={`code-file-head'), tsx.indexOf('<span className="code-file-name">'));
    expect(head).toMatch(/onClick=/);
  });

  it('draws no code for a folded file', () => {
    expect(tsx).toMatch(/!folded\.has\(file\.path\) && \(/);
  });

  it('marks a folded file in the tree and on its header, quietly', () => {
    expect(tsx).toMatch(/folded\.has\(row\.path\) \? ' is-folded' : ''/);
    expect(css).toMatch(/^\.code-file\.is-folded/m);
    expect(css).toMatch(/^\.code-file-head \.code-fold-caret/m);
  });
});
