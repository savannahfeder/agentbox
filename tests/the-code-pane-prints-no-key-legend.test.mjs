// THE CODE PANE PRINTS NO KEY LEGEND.
//
// What was there: four lines at the foot of the file tree, drawn the whole time
// the pane was open, saying J and K move down and up, E opens the file in your
// editor, ⌘S saves what you typed, esc closes this.
//
// Three things are worth a test rather than an eye, and the third is the reason
// this file exists at all rather than a one-line deletion.
//
//   THE TEXT IS GONE AND STAYS GONE. It reads as a footer of chrome on the one
//   surface opened to read code, and it was removed by name.
//
//   THE KEYS THEMSELVES ARE NOT GONE. Only the text was removed. J and K still
//   walk the files, ⌘S still saves what was typed into a line, esc still closes
//   the pane. A session reading the request quickly could delete the handler
//   with the legend and nothing in the suite would have noticed.
//
// NOTHING PUTS IT BACK AS A HOVER, A MENU OR A "?". The app already has one
// answer for printing keys and it is a switch the user owns: `zero.keyhints`,
// settings and ⌘K. This strip never asked that switch, so with hints turned
// OFF the code pane went on printing four of them. Anything that returns here
// has to go through the switch, and the honest fix for getting INTO this pane
// is discoverability, not a legend inside it.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(here, '..', ...p), 'utf8');
const codeArtifact = read('renderer', 'src', 'components', 'CodeArtifact.tsx');
const css = read('renderer', 'src', 'styles.css');

// The rendered half of the component, so a sentence in a comment above it
// cannot satisfy a test about what is drawn on her screen.
const drawn = codeArtifact.slice(codeArtifact.indexOf('return (\n    <div className="code-artifact">'));

describe('the legend at the foot of the file tree is gone', () => {
  it('draws no key strip and keeps no rule for one', () => {
    expect(drawn).not.toContain('code-tree-keys');
    expect(css).not.toContain('.code-tree-keys');
  });

  it('says none of the four lines anywhere in what it draws', () => {
    for (const line of [
      'move down and up',
      'opens the file in your editor',
      'saves what you typed',
      'closes this',
    ]) {
      expect(drawn).not.toContain(line);
    }
  });

  it('prints no bare keycap of its own in the tree', () => {
    // <b>J</b>, <b>⌘S</b> and the rest. The pane has no <kbd> either: the
    // app's keycap belongs to the row hints and the tab strip, both of which
    // obey the user's switch.
    expect(drawn).not.toMatch(/<b>[A-Z⌘⏎]/);
    expect(drawn).not.toContain('<kbd>');
  });
});

describe('the keys she did not strike still work', () => {
  // This block used to assert the opposite, in the belief that striking the
  // legend was not striking the keys. That was later settled the other way,
  // so the test is inverted rather than deleted: the
  // pane has to keep NOT having them.
  it('no longer walks the files on J and K', () => {
    expect(codeArtifact).not.toMatch(/e\.key === 'j' \|\| e\.key === 'k' \|\| e\.key === 'J' \|\| e\.key === 'K'/);
    const rules = read('renderer', 'src', 'code-keys.ts');
    expect(rules).not.toMatch(/case 'j'/);
    expect(rules).not.toMatch(/case 'k'/);
    expect(rules).toMatch(/case 'ArrowDown': return to\(at \+ 1\)/);
    expect(rules).toMatch(/case 'ArrowUp': return to\(at - 1\)/);
  });

  it('keeps the arrows walking the tree, which is what a person tries untold', () => {
    // stepInTree since 2026-10-04: the same walk, by path, so a folded folder
    // cannot move her (tests/folding-the-tree-never-moves-the-code.test.mjs).
    expect(codeArtifact).toMatch(/stepInTree\(e\.key, current\?\.path/);
  });

  it('still swallows J and K so a stray press cannot swap her task out', () => {
    // The removal must not become a surprise. CHANGE_OWNS is what makes
    // App.tsx stand down, and the app's J means "next task": drop them from
    // the set and a J pressed over a change closes it and brings up another
    // card, which is the fault round two of this item was filed for.
    const rules = read('renderer', 'src', 'code-keys.ts');
    const owns = rules.slice(rules.indexOf('export const CHANGE_OWNS'));
    expect(owns.slice(0, 240)).toMatch(/'j', 'k'/);
  });

  it('still saves the whole change on ⌘S, from inside the line she is typing in', () => {
    expect(codeArtifact).toMatch(/\(e\.metaKey \|\| e\.ctrlKey\) && \(e\.key === 's' \|\| e\.key === 'S'\)/);
    expect(codeArtifact).toContain('void saveAll();');
  });

  it('still steps out of a line on Escape rather than out of the file', () => {
    expect(codeArtifact).toMatch(/e\.key === 'Escape'[\s\S]{0,120}blur\(\)/);
  });

  it('still leaves E alone, which is Close everywhere else in the app', () => {
    // 2026-08-24. The legend went on advertising E for two days after the
    // binding was deleted, which is the worse half of a stale hint: it named
    // a key the app does not have.
    expect(codeArtifact).not.toMatch(/e\.key === 'e' \|\| e\.key === 'E'/);
  });
});

describe('the unsaved mark still carries the one key it needs to', () => {
  it('says Press ⌘S where she can only see it with something unsaved', () => {
    // The word Unsaved is drawn only while that file is dirty, and the key
    // rides its label rather than a strip that shows the whole time.
    expect(drawn).toContain('<span className="code-file-unsaved" title="Not saved yet. Press ⌘S.">Unsaved</span>');
  });
});
