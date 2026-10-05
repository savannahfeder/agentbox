// THE HAIRLINE SITS CLOSE UNDER THE SOLUTION (w-b51b2e1c86).
//
// Asked on 2026-10-04 off a long summary that scrolled: less room under the
// Solution, so more of the words fit. Measured in the real renderer at
// 1440x900 dark (scripts/scratch/shot-summary-spacing.mjs): the last line's
// words ended 52px above the hairline (6 of the line's own padding, 18 of the
// section's margin, 28 of the foot's padding), against 22px from the hairline
// down to Status. Picked from four full-window shots: the foot adds nothing of
// its own, so the hairline sits 24px under the words, the same step as from
// one section to the next, and the panel scrolled 28px less. The space between
// the properties and the bottom edge stays, so Updated still sits level with
// the reply box.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../renderer/src/threads/summary.css', import.meta.url), 'utf8');
const rule = (sel) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`));
  return m ? m[1] : '';
};
const px = (block, prop) => Number(block.match(new RegExp(`(?:^|[;\\s])${prop}:\\s*(-?[\\d.]+)px`))?.[1] ?? 0);

// CHANGED 2026-10-05 (w-54e9c7243f): the parts of the summary moved closer
// together, 12px of margin instead of 18 (picked on full-window pictures), so
// the foot now adds 6px of its own and the hairline stays 24px under the words.
describe('the room under the last part of the summary', () => {
  it('is still 24px from the words to the hairline', () => {
    const line = px(rule('.ts-line, .ts-edit').replace(/padding: (\d+)px \d+px (\d+)px/, 'padding-bottom: $2px'), 'padding-bottom');
    const section = Number(rule('.ts-sec').match(/margin: 0 0 (\d+)px/)?.[1]);
    const foot = px(rule('.ts-foot'), 'padding-top');
    expect(line).toBe(6);
    expect(section).toBe(12);
    expect(foot).toBe(6);
    expect(line + section + foot).toBe(24);
  });

  it('still pushes the foot to the bottom when the words are short', () => {
    expect(rule('.ts-foot')).toMatch(/margin-top: auto/);
  });

  it('keeps the space from the hairline to Status and under the last property', () => {
    expect(rule('.ts-rule')).toMatch(/margin: 0 0 22px/);
    expect(rule('.ts-panel')).toMatch(/padding: 26px 28px 40px/);
    expect(rule('.ts-props')).toMatch(/row-gap: 14px/);
  });
});
