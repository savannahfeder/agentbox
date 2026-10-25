// THE CARD'S CORNER MARKS STAND OUTSIDE IT, THE SIDEBAR'S PICK IS QUIET, AND
// ⌘K MARKS ITS PICK WITH AN ORANGE EDGE (w-22da913d00, 2026-10-20).
//
// Kept from ten rounds of a new Dark look that was set aside: in Dark the four
// corner marks sat 8px inside the card and read better 7px outside it; the
// sidebar's selected page was a solid grey block, "kind of too much", and is a
// faint fill with a hairline; ⌘K's selected row is a faint fill with an
// orange edge on its left instead of a solid block.
//
// Marks outside the card cannot be painted by the card itself, and
// `.workspace-layout::after` is the window's drag strip, so they have their own
// element. This pins that the drag strip is left alone.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', 'renderer', 'src', f), 'utf8');
const styles = read('styles.css');
const nav = read('workspace-navigation.css');
const E = ':root\\[data-skin="ember-grid"\\]';
const rule = (css, sel) => css.match(new RegExp(`(?:^|\\n)${sel} \\{([^}]*)\\}`))?.[1] ?? '';

describe('in Dark, the corner marks', () => {
  it('are no longer painted inside the card', () => {
    expect(nav).not.toMatch(/grid-ticks/);
  });
  it('stand 7px outside it, on their own element', () => {
    expect(read('App.tsx')).toMatch(/<div className="panel-marks" aria-hidden="true" \/>/);
    expect(nav).toMatch(/^\.panel-marks \{ display: none; \}/m);
    expect(rule(nav, `${E} \\.panel-marks::after`)).toMatch(/inset: -7px;/);
  });
  it('leave the window draggable', () => {
    expect(nav).not.toMatch(new RegExp(`${E} \\.workspace-layout::after`));
    expect(nav).toMatch(/\.workspace-layout::after \{[^}]*-webkit-app-region: drag;/);
  });
});

describe("the sidebar's selected page", () => {
  it('is a faint fill with a hairline in Dark, not the solid selected grey', () => {
    const dark = rule(nav, `${E} \\.workspace-navigation \\.workspace-tab\\.active`);
    expect(dark).not.toMatch(/var\(--bg-selected\)/);
    expect(dark).toMatch(/box-shadow: inset 0 0 0 1px/);
  });
});

describe('⌘K', () => {
  it('marks the selected row with a faint fill and an orange edge', () => {
    const sel = rule(styles, '\\.palette-item\\.selected');
    expect(sel).toMatch(/background: var\(--wash\)/);
    expect(sel).toMatch(/box-shadow: inset 2px 0 0 var\(--accent\)/);
  });
  it('wears no corner marks in Dark', () => {
    expect(rule(nav, `${E} \\.modal`)).not.toMatch(/ticks/);
  });
});
