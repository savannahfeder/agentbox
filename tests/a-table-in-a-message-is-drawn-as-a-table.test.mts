// A TABLE IN A MESSAGE IS DRAWN AS A TABLE.
//
// "I feel like these tables get rendered in a really weird way ... I would
// actually prefer a true table" (2026-10-14). The message view had no rule for
// a table at all, so an agent's markdown table came out in the browser's bare
// defaults: no lines between cells, headers bold and centred, every cell
// floating at the middle of its row, and a column of numbers jammed together
// ("Before After" read as one word). Measured by drawing the same nine-row,
// five-column answer in the built interface, full screen in dark mode, before
// and after: before there were no borders and every cell sat mid-row.
//
// The fix is the grid: a line round every cell, the header on a soft band,
// everything read from the top-left, and a wide table scrolls sideways rather
// than crushing its columns.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'renderer', 'src', 'styles.css'), 'utf8');

// Every declaration a selector gets, from every top-level rule that names it.
const declarationsFor = (selector) => {
  const out = {};
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of plain.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = m[1].split(',').map((s) => s.trim());
    if (!selectors.includes(selector)) continue;
    for (const d of m[2].split(';')) {
      const i = d.indexOf(':');
      if (i > 0) out[d.slice(0, i).trim()] = d.slice(i + 1).trim();
    }
  }
  return out;
};

describe('a table in a message', () => {
  it('has a line round every cell', () => {
    const table = declarationsFor('.markdown table');
    expect(table['border-collapse']).toBe('collapse');
    for (const cell of ['.markdown th', '.markdown td']) {
      expect(declarationsFor(cell).border).toMatch(/1px solid var\(--line\)/);
    }
  });

  it('reads every cell from the top-left, headers included', () => {
    for (const cell of ['.markdown th', '.markdown td']) {
      const d = declarationsFor(cell);
      expect(d['text-align']).toBe('left');
      expect(d['vertical-align']).toBe('top');
      expect(d.padding).toBeTruthy();
    }
  });

  // The full raised grey read as "a little too prominent"; she approved it at
  // half strength.
  it('puts the header on a half-strength raised band, and not the body', () => {
    expect(declarationsFor('.markdown th').background).toBe('color-mix(in srgb, var(--bg-raised) 50%, transparent)');
    expect(declarationsFor('.markdown td').background).toBeUndefined();
  });

  it('scrolls a table wider than the message instead of crushing it', () => {
    const table = declarationsFor('.markdown table');
    expect(table['overflow-x']).toBe('auto');
    expect(table['max-width']).toBe('100%');
  });

  it('leaves the document editor its own table rule', () => {
    expect(declarationsFor('.doc-rich .ProseMirror th').border).toMatch(/1px solid var\(--line\)/);
  });
});
