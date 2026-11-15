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
//
// THE BUTTON LEFT THE CORNER ON w-a3482b8c2c (2026-10-02): the summary opens
// from the rail it folds to and closes from an icon beside its own title. The
// rule moved with it, so both of those are held to it here.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HINTS } from '../renderer/src/hint-plate';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const summary = fs.readFileSync(path.join(root, 'renderer/src/threads/Summary.tsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'renderer/src/threads/summary.css'), 'utf8');

// The rail, whole, and the close button's own tag inside the panel.
const rail = (() => {
  const start = summary.indexOf('export function SummaryRail');
  return summary.slice(start, summary.indexOf('\n}\n', start));
})();
const close = (() => {
  const start = summary.indexOf('className="ts-close"');
  return summary.slice(summary.lastIndexOf('<button', start), summary.indexOf('</button>', start));
})();

describe('the summary’s own buttons say their key on hover, not on their face', () => {
  it('draw no key cap', () => {
    expect(rail).toContain('className="ts-rail"');
    expect(close).toContain('className="ts-close"');
    for (const b of [rail, close]) expect(b).not.toContain('<kbd');
    expect(css).not.toMatch(/\.ts-(rail|close) kbd/);
  });

  it('do not print the key in their tooltips either', () => {
    // A native tooltip under the plate saying the same S is the key twice.
    for (const b of [rail, close]) expect(b).not.toMatch(/title=\{?[^}>]*·\s*S/);
    expect(rail).toMatch(/Show the summary/);
    expect(close).toMatch(/Hide the summary/);
  });

  it('wear a hint, lined up from the right since both stand at the window’s right', () => {
    for (const b of [rail, close]) {
      expect(b).toContain('data-hint="summary"');
      expect(b).toContain('data-hint-align="right"');
    }
  });

  it('has a plate that names the key and what it does', () => {
    expect(HINTS.summary).toEqual([{ key: 'S', what: 'Show or hide the summary' }]);
  });

  it('promises the key the summary really listens for', () => {
    expect(summary).toMatch(/if \(e\.key !== 's' && e\.key !== 'S'\) return;/);
  });

  it('leaves the row\'s plate alone, where L schedules', () => {
    // Scheduling moved from S to L everywhere (tests/s-means-the-summary-and-
    // l-means-later.test.mjs), and the row's plate must not have been rewritten
    // along with this one.
    expect(HINTS.row.find((l) => l.key === 'L').what).toBe('Schedule for later');
    expect(HINTS.row.some((l) => l.key === 'S')).toBe(false);
  });
});

// THE PLATE'S EDGE WAS SOFTER THAN THE BUTTON IT HANGS FROM. Measured in the
// built app on the dark look, 2026-10-01: the open Summary button's outline was
// rgba(255,255,255,.19), `--line-strong`, and the plate under it was .1,
// `--line`, so the plate read as blurred next to the button. Approved the same
// day: every plate and its key cap take the button's edge, and the button's
// corners too. Those went square on every look in 2af5296 (`--tag-radius`,
// 0px), while the plate kept `--radius`, 3px, so it read as the softer thing.
// The Summary button is gone from the corner (w-a3482b8c2c); the square the
// plate hangs beside there now is the thread menu's, `.ts-more`, which wears
// the same edge and the same corners.
describe('the hint plate has the edge of the button it hangs from', () => {
  const styles = fs.readFileSync(path.join(root, 'renderer/src/styles.css'), 'utf8');
  const rule = (sel) => styles.match(new RegExp(`\\n${sel.replace(/[.*]/g, '\\$&')} \\{[^}]*\\}`, 's'))?.[0] ?? '';
  it('draws the plate and its caps with --line-strong, as a pressed button is', () => {
    expect(css).toMatch(/\.ts-more\[aria-expanded="true"\] \{[^}]*border-color: var\(--line-strong\)/);
    expect(rule('.hint-plate')).toContain('border: 1px solid var(--line-strong)');
    expect(rule('.hint-caps kbd')).toContain('border: 1px solid var(--line-strong)');
  });
  it('does not fall back to the faint --line anywhere', () => {
    expect(rule('.hint-plate')).not.toMatch(/var\(--line\)/);
    expect(rule('.hint-caps kbd')).not.toMatch(/var\(--line\)/);
  });
  it('takes its corners from the same token as the button, never a number of its own', () => {
    const token = css.match(/\.ts-more \{[^}]*border-radius: var\((--[a-z-]+)\)/)?.[1];
    expect(token).toBe('--tag-radius');
    expect(rule('.hint-plate')).toContain(`border-radius: var(${token})`);
    expect(rule('.hint-caps kbd')).toContain(`border-radius: var(${token})`);
  });
});
