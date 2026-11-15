// A BOARD CARD IS ROUND, IN LIGHT AND IN DARK.
//
// "If you make most things round, these cards also have to be round as well",
// about the In progress tab drawn as a Board, on a dark-mode screenshot where
// the cards were square. Measured off the stylesheets on 2026-11-01: `.th-card`
// took `var(--radius)`, the small control corner, which the Dark skin
// (ember-grid) sets to 0px, so every board card there had square corners, and
// in Light it was the 6px button corner rather than the 10px card corner every
// other card and menu wears.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'renderer/src');
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '');
// soft-corners.css loads after the others, so it is read last and wins a tie.
const text = ['styles.css', 'threads/pages.css', 'soft-corners.css'].map((f) => strip(readFileSync(join(src, f), 'utf8'))).join('\n');
const rules = [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selectors: m[1].split(',').map((s) => s.trim().replace(/\s+/g, ' ')), body: m[2] }));

function cornerOf(sel) {
  let found = null;
  for (const r of rules) {
    if (!r.selectors.includes(sel)) continue;
    const m = /border-radius:\s*([^;]+)/.exec(r.body);
    if (m) found = m[1].trim();
  }
  return found;
}

const darkBlock = (() => {
  const at = text.indexOf(':root[data-skin="ember-grid"] {');
  return text.slice(at, text.indexOf('}', at));
})();

describe('a board card', () => {
  it('takes the card corner', () => {
    expect(cornerOf('.th-card')).toBe('var(--artifact-corner)');
  });

  it('keeps it in Dark, which squares nothing', () => {
    // Rounded in every theme since 2026-11-02 (one-corner-for-the-whole-app).
    expect(darkBlock).not.toMatch(/--radius:/);
    expect(darkBlock).not.toMatch(/--artifact-corner\s*:/);
  });

  it('keeps it when picked, selected, lifted or dragged: no state redraws the corner', () => {
    for (const sel of ['.th-card.selected', '.th-card.picked', '.th-card[data-lifted]', '.th-card.drag-preview', '.th-card:hover']) {
      expect(cornerOf(sel), sel).toBeNull();
    }
  });
});

describe('what must not change', () => {
  it('the small corner on what you press is still squared in Dark', () => {
    expect(text).toMatch(/--radius:\s*var\(--artifact-corner-small\);/);
  });
});
