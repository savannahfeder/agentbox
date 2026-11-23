// THE HINT PLATE HAS THE EDGE OF THE BUTTON IT HANGS FROM (w-5984544441).
//
// This file held the summary's own buttons to the rule that a key is shown on
// hover and never on the button's face. Those buttons went with the side
// summary (w-d143fcb40a); the plate's edge, measured below, is what remains.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const css = fs.readFileSync(path.join(root, 'renderer/src/threads/summary.css'), 'utf8');

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
