// YOUR FACE IN THE SIDEBAR IS THE SIZE YOU PICKED (w-e8093df8f0).
//
// 2bb48bc made the face at the foot of the sidebar as tall as the two lines
// beside it: 36px, up from the 22px it had been. On 2026-10-02 she sent a
// picture of it and said it was "a little large, can we reduce it a bit, maybe
// to around the size it was before". 24px shipped first; she then asked to see
// the sizes side by side at full screen, was shown 22, 24, 28, 32 and 36, and
// answered "32px approved".
//
// These pin the open sidebar's face at exactly 32: not the 36 she called too
// large, not the 24 that shipped before she had compared them, and pin that
// the collapsed rail keeps its own 22px square.
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
  it('was 22px before it grew, the base every .th-me face starts from', () => {
    expect(px(before.width)).toBe(22);
  });

  it('is the 32px she approved in the open sidebar', () => {
    expect(px(open.width)).toBe(32);
  });

  it('is neither the 36px she called too large nor the 24px that shipped first', () => {
    expect(px(open.width)).not.toBe(36);
    expect(px(open.width)).not.toBe(24);
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
