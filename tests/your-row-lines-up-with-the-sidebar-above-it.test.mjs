// YOUR ROW LINES UP WITH THE SIDEBAR ABOVE IT (w-e8093df8f0).
//
// 2bb48bc made the face at the foot of the sidebar 36px, up from 22px. On
// 2026-10-02 she called it "a little large"; 24px shipped, then 32px after a
// side-by-side, and 32 still felt "a little bit weird ... I can't put my finger
// on" it. Measured in the built app at 1440x900: the icons above run x 32-50
// and their labels start at x 61, while the 32px face ran 30-62 and your name
// started at x 71. The face stuck out past the icon column and the name sat
// 10px off the labels' line, so the foot was off the edge the rest of the
// sidebar keeps. Shown seven versions at full screen, she picked "this one
// wins": 28px, light border kept, name on the labels' line, photo on the icons.
//
// These pin the 28px face, and pin the alignment as arithmetic over the
// sidebar's own rules, so a change to the menu's padding, icon or gap that
// is not matched here goes red instead of quietly knocking the row off again.
// The collapsed rail keeps its 22px square and its own spacing.
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import postcss from 'postcss';

const team = postcss.parse(readFileSync('renderer/src/team/team.css', 'utf8'));
const nav = postcss.parse(readFileSync('renderer/src/workspace-navigation.css', 'utf8'));

// The last value each property gets in rules with exactly this selector.
function declsOf(css, selector) {
  const out = {};
  css.walkRules((rule) => {
    if (rule.selectors.includes(selector)) rule.walkDecls((d) => { out[d.prop] = d.value; });
  });
  return out;
}
const px = (v) => (v == null ? undefined : Number.parseFloat(v));
// `padding: 0 10px` -> its left side.
const padLeft = (decls) => px(decls['padding-left'] ?? decls.padding?.split(/\s+/).at(-1));

const face = declsOf(team, '.workspace-navigation .th-me .tm-av');
const row = declsOf(team, '.workspace-navigation .th-me');
const collapsedFace = declsOf(team, '.workspace-collapsed .workspace-navigation .th-me .tm-av');
const collapsedRow = declsOf(team, '.workspace-collapsed .workspace-navigation .th-me');
const menuButton = declsOf(nav, '.workspace-navigation button');
const menuIcon = declsOf(nav, '.workspace-navigation svg');

describe('your row at the foot of the sidebar', () => {
  it('draws your face at the 28px she picked', () => {
    expect(px(face.width)).toBe(28);
    expect(px(face.height)).toBe(28);
    expect(px(face['line-height'])).toBe(26); // 1px border top and bottom
  });

  it('is none of the sizes she turned down or passed over: 36, 32 or 24', () => {
    for (const n of [36, 32, 24]) expect(px(face.width)).not.toBe(n);
  });

  it('starts your name exactly where the labels above it start', () => {
    const labels = padLeft(menuButton) + px(menuIcon.width) + px(menuButton.gap);
    const name = padLeft(row) + px(face.width) + px(row.gap);
    expect(labels).toBe(39);
    expect(name).toBe(labels);
  });

  it('centres your face on the icon column, to within a pixel', () => {
    const icons = padLeft(menuButton) + px(menuIcon.width) / 2;
    const yours = padLeft(row) + px(face.width) / 2;
    expect(Math.abs(yours - icons)).toBeLessThanOrEqual(1);
  });

  it('keeps the collapsed rail as it was: a 22px square, 8px in', () => {
    expect(px(collapsedFace.width)).toBe(22);
    expect(px(collapsedFace.height)).toBe(22);
    expect(padLeft(collapsedRow)).toBe(8);
  });
});
