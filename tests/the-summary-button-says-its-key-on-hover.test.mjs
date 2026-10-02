// THE SUMMARY BUTTON PRINTED ITS OWN KEY, AND NO OTHER BUTTON DOES.
//
// w-5984544441 (2026-10-01). The thread's top bar drew "Summary S", with the S
// as a faint cap inside the button. The app's rule is that a shortcut is shown
// on hover, in the plate that hangs under the component (hint-plate.ts), and
// never in the component itself: every other hinted button in the corner (New
// thread, the terminal, the sidebar toggle) is drawn bare. Measured on main at
// 9936cfa: one `<kbd>` inside SummaryToggle, and no `data-hint` on it, so
// hovering it showed no plate at all.
//
// So the cap comes out, the button wears a hint, and the key it promises is the
// one the summary's own handler really runs.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HINTS } from '../renderer/src/hint-plate';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const summary = fs.readFileSync(path.join(root, 'renderer/src/threads/Summary.tsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'renderer/src/threads/summary.css'), 'utf8');

const toggle = (() => {
  const start = summary.indexOf('export function SummaryToggle');
  return summary.slice(start, summary.indexOf('\n}\n', start));
})();

describe('the Summary button says its key on hover, not on its face', () => {
  it('draws no key cap inside the button', () => {
    expect(toggle).toContain('Summary');
    expect(toggle).not.toContain('<kbd');
    // and the stylesheet keeps no rule for a cap that is gone
    expect(css).not.toMatch(/\.ts-sumbtn kbd/);
  });

  it('does not print the key in its tooltip either', () => {
    // A native tooltip under the plate saying the same S is the key twice.
    expect(toggle).not.toMatch(/title=\{[^}]*·\s*S/);
    expect(toggle).toMatch(/Show the summary/);
    expect(toggle).toMatch(/Hide the summary/);
  });

  it('wears a hint, lined up from the right like the rest of the corner', () => {
    expect(toggle).toContain('data-hint="summary"');
    expect(toggle).toContain('data-hint-align="right"');
  });

  it('has a plate that names the key and what it does', () => {
    expect(HINTS.summary).toEqual([{ key: 'S', what: 'Show or hide the summary' }]);
  });

  it('promises the key the summary really listens for', () => {
    expect(summary).toMatch(/if \(e\.key !== 's' && e\.key !== 'S'\) return;/);
  });

  it('leaves the row\'s own S alone, which schedules rather than shows a summary', () => {
    // The same letter means something else in the list, and that plate must
    // not have been rewritten along with this one.
    expect(HINTS.row.find((l) => l.key === 'S').what).toBe('Schedule for later');
  });
});

// THE PLATE'S EDGE WAS SOFTER THAN THE BUTTON IT HANGS FROM. Measured in the
// built app on the dark look, 2026-10-01: the open Summary button's outline was
// rgba(255,255,255,.19), `--line-strong`, and the plate under it was .1,
// `--line`, so the plate read as blurred next to the button. Approved the same
// day: every plate and its key cap take the button's edge. The corners were
// already the button's, both `--radius`, which is square on Ember Grid.
describe('the hint plate has the edge of the button it hangs from', () => {
  const styles = fs.readFileSync(path.join(root, 'renderer/src/styles.css'), 'utf8');
  const rule = (sel) => styles.match(new RegExp(`\\n${sel.replace(/[.*]/g, '\\$&')} \\{[^}]*\\}`, 's'))?.[0] ?? '';
  it('draws the plate and its caps with --line-strong, as a pressed button is', () => {
    expect(css).toMatch(/\.ts-sumbtn\.on \{[^}]*border-color: var\(--line-strong\)/);
    expect(rule('.hint-plate')).toContain('border: 1px solid var(--line-strong)');
    expect(rule('.hint-caps kbd')).toContain('border: 1px solid var(--line-strong)');
  });
  it('does not fall back to the faint --line anywhere', () => {
    expect(rule('.hint-plate')).not.toMatch(/var\(--line\)/);
    expect(rule('.hint-caps kbd')).not.toMatch(/var\(--line\)/);
  });
  it('rounds its corners with the same token as the button, never a number of its own', () => {
    expect(css).toMatch(/\.ts-sumbtn \{[^}]*border-radius: var\(--radius\)/);
    expect(rule('.hint-plate')).toContain('border-radius: var(--radius)');
    expect(rule('.hint-caps kbd')).toContain('border-radius: var(--radius)');
  });
});
