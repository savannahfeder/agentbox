// THE WORD IS "PROJECT".
//
// THE DEFECT THIS PINS. ⌘K filters on a row's own label, and the one row that
// makes a project said "New product…". So typing her own word into the command
// palette matched NOTHING, and the only door to a new project was invisible to
// the person who owns it. It was also row 82 of about 82.
//
// Both halves are held here, in the surfaces the founder actually reads, so a
// later session cannot quietly put the old word back.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// What the palette actually renders as its rows: the label strings, in order.
function paletteLabels() {
  const src = read('renderer/src/components/Palette.tsx');
  const body = src.slice(src.indexOf('const commands: Command[]'), src.indexOf('const filtered'));
  return [...body.matchAll(/label: ('([^']*)'|`([^`]*)`)/g)].map((m) => m[2] ?? m[3]);
}

describe('⌘K says her word', () => {
  it('offers "New project…", so typing "project" finds it', () => {
    const labels = paletteLabels();
    expect(labels).toContain('New project…');
    // The filter is a plain lowercase substring match on the label, which is
    // the exact thing that used to fail her.
    const typed = 'project';
    expect(labels.filter((l) => l.toLowerCase().includes(typed))).toContain('New project…');
  });

  it('no longer offers "New product…" anywhere', () => {
    expect(paletteLabels()).not.toContain('New product…');
    // Comments stripped: the file still TELLS the story of the old word, on
    // purpose. What must not survive is any of it reaching the screen.
    const code = read('renderer/src/components/Palette.tsx')
      .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    expect(code).not.toContain('New product');
    // And the whole two-step name-then-confirm prompt it opened is gone: the
    // card asks the one thing instead.
    expect(code).not.toContain('as a new product?');
  });

  // THIS SAID "TOP TWO" FOR FOUR DAYS AND IS BACK TO FIRST. A product
  // decision put "New project…" at row one.
  //
  // The complaint this test was written for is that "New project…" sat at row
  // 82 of about 82 and could not be found by the word she calls it.
  it('is at the top, not last of about eighty', () => {
    const labels = paletteLabels();
    expect(labels[0]).toBe('New project…');
  });

  // AND THE FEEDBACK ROW IS NOT COMING BACK BY ACCIDENT. It may be built
  // again later, on a database set up for it, and not before.
  it('offers no feedback row at all', () => {
    expect(paletteLabels().some((l) => /feedback/i.test(l))).toBe(false);
  });
});

describe('the new-task card asks one thing and explains nothing', () => {
  it('the heading reads "Which project" and carries no instructions', () => {
    const src = read('renderer/src/components/Compose.tsx');
    expect(src).toContain('<span className="proj-head">Which project</span>');
    expect(src).not.toContain('⇥ switches');
    expect(src).not.toContain('drag to rank');
  });

  it('carries the + New project chip, which is door A', () => {
    expect(read('renderer/src/components/Compose.tsx')).toContain('+ New project');
  });
});

describe('Settings offers a + on the heading, never a row', () => {
  it('puts the plus on the PROJECTS heading the list already had', () => {
    const src = read('renderer/src/components/Settings.tsx');
    expect(src).toContain('className="set-nav-group np-head"');
    expect(src).toContain('className="np-plus"');
  });

  it('adds no new row to the project list, which she called unappealing', () => {
    const src = read('renderer/src/components/Settings.tsx');
    expect(src).not.toContain('set-nav-item np-new');
  });
});
