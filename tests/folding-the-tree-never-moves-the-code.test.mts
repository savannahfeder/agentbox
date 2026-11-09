// FOLDING THE TREE NEVER MOVES THE CODE, AND PRESSING YOUR OWN FILE TAKES YOU TO ITS TOP.
//
// Both found by the GPT-6.1-Sol tester on 2026-10-04, on a real 44-file change.
//
// - Standing in Focus.tsx, folding the folder it is in (renderer/src) threw the
//   code from scroll 2,739 to 20,787, onto shared/instruction-defaults.json, and
//   unfolding did not bring it back. Where she stood was a POSITION in the
//   visible tree, folding shortened the tree, and the same position named a
//   different file, which the pane then dutifully jumped to.
// - Scrolled 600px into App.tsx, pressing App.tsx in the tree left the code at
//   11,516: "where she is" did not change, so nothing ran.
//
// Where she stands is now an index into ALL the files of the change, which
// folding never changes, and a press on a file always jumps.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { stepInTree } from '../renderer/src/code-artifact.ts';

const tsx = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'renderer', 'src', 'components', 'CodeArtifact.tsx'), 'utf8');
const all = ['a/one.ts', 'a/two.ts', 'b/three.ts', 'b/four.ts', 'c/five.ts'];

describe('walking the tree with the arrows', () => {
  it('steps through the visible files', () => {
    expect(stepInTree('ArrowDown', 'a/one.ts', all, all)).toBe('a/two.ts');
    expect(stepInTree('ArrowUp', 'a/two.ts', all, all)).toBe('a/one.ts');
    expect(stepInTree('Home', 'b/four.ts', all, all)).toBe('a/one.ts');
    expect(stepInTree('End', 'a/one.ts', all, all)).toBe('c/five.ts');
  });

  it('steps over a folded folder', () => {
    const shown = ['a/one.ts', 'a/two.ts', 'c/five.ts'];
    expect(stepInTree('ArrowDown', 'a/two.ts', shown, all)).toBe('c/five.ts');
  });

  it('leaves a file inside a folded folder for the nearest one shown', () => {
    // She is in b/three.ts and folded b: down goes to the next file shown,
    // up to the one before, never back to the top.
    const shown = ['a/one.ts', 'a/two.ts', 'c/five.ts'];
    expect(stepInTree('ArrowDown', 'b/three.ts', shown, all)).toBe('c/five.ts');
    expect(stepInTree('ArrowUp', 'b/three.ts', shown, all)).toBe('a/two.ts');
  });

  it('stays put at either end, and ignores other keys', () => {
    expect(stepInTree('ArrowUp', 'a/one.ts', all, all)).toBeNull();
    expect(stepInTree('ArrowDown', 'c/five.ts', all, all)).toBeNull();
    expect(stepInTree('j', 'a/one.ts', all, all)).toBeNull();
    expect(stepInTree('ArrowDown', 'a/one.ts', [], all)).toBeNull();
  });
});

describe('the pane', () => {
  it('stands on a file of the whole change, not a row of the tree', () => {
    expect(tsx).toMatch(/const current = files\[/);
  });

  it('does not move where she stands when a folder folds', () => {
    const fold = tsx.slice(tsx.indexOf("row.kind === 'folder' ? ("), tsx.indexOf('<span className="code-node-name">{row.label}</span>'));
    expect(fold).not.toMatch(/setAt\(/);
  });

  it('jumps on every press of a file, the one she is on included', () => {
    expect(tsx).toMatch(/setJump\(\(n\) => n \+ 1\)/);
    expect(tsx).toMatch(/\}, \[current\?\.path, jump\]\);/);
  });
});
