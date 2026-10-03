// YOUR FACE IN THE SIDEBAR IS ABOUT THE SIZE IT WAS (w-e8093df8f0).
//
// 2bb48bc made the face at the foot of the sidebar as tall as the two lines
// beside it: 36px, up from the 22px it had been. On 2026-10-02 she sent a
// picture of it and said it was "a little large, can we reduce it a bit, maybe
// to around the size it was before". Measured from team.css: 36px square, 64%
// wider than the 22px threads/pages.css gives every .th-me face.
//
// So the open sidebar draws it at 24px: back to about where it was, a touch
// bigger because it now sits beside two lines rather than one. These pin the
// size inside a band around the old one (22 to 26), so neither the 36px nor
// something smaller than it ever was comes back, and pin that the collapsed
// rail keeps its own 22px square.
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import postcss from 'postcss';

const team = postcss.parse(readFileSync('renderer/src/team/team.css', 'utf8'));
const pages = postcss.parse(readFileSync('renderer/src/threads/pages.css', 'utf8'));

// The last value each property gets in rules with exactly this selector.
function declsOf(css, selector) {
  const out = {};
  css.walkRules((rule) => {
    if (rule.selectors.includes(selector)) rule.walkDecls((d) => { out[d.prop] = d.value; });
  });
  return out;
}
const px = (v) => (v == null ? undefined : Number.parseFloat(v));

const open = declsOf(team, '.workspace-navigation .th-me .tm-av');
const collapsed = declsOf(team, '.workspace-collapsed .workspace-navigation .th-me .tm-av');
const before = declsOf(pages, '.th-me .tm-av');

describe('your face in the sidebar', () => {
  it('was 22px before it grew, which is what "the size it was before" means', () => {
    expect(px(before.width)).toBe(22);
  });

  it('is about that size again in the open sidebar, not the 36px it grew to', () => {
    const size = px(open.width);
    expect(size).not.toBe(36);
    expect(size).toBeGreaterThanOrEqual(22);
    expect(size).toBeLessThanOrEqual(26);
  });

  it('stays square, with its initials centred in it', () => {
    expect(px(open.height)).toBe(px(open.width));
    // 1px border top and bottom, so the initials' line is two less than the box.
    expect(px(open['line-height'])).toBe(px(open.width) - 2);
  });

  it('keeps the small square in the collapsed rail, where it is an icon among icons', () => {
    expect(px(collapsed.width)).toBe(22);
    expect(px(collapsed.height)).toBe(22);
  });
});
