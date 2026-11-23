// THE SAVE SIGN-IN CHECKBOX IS THE BOX YOU CLICK.
//
// What broke: a power tester on a cloud Supabase sign-in card saw "Save this
// sign-in for every cloud thread" but its screen tool listed no checkbox to
// press. The real checkbox lay invisible under the drawn box with clicks
// switched off, so what sat under the pointer at the box was the drawn box,
// not a checkbox. Measured with browse.mjs's look, which numbers the element
// found at each control's centre.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../renderer/src/components/need-card.css', import.meta.url), 'utf8');
const rule = (selector: string) => {
  const at = css.split('\n').find((l) => l.trim().startsWith(`${selector} {`));
  if (!at) throw new Error(`no rule for ${selector}`);
  return at.slice(at.indexOf('{') + 1, at.lastIndexOf('}'));
};
const px = (body: string, prop: string) => body.match(new RegExp(`(?:^|;)\\s*${prop}:\\s*([\\d.]+)px`))?.[1];

describe('the save sign-in checkbox', () => {
  const input = rule('.need-check input');
  const box = rule('.need-check-box');

  it('takes clicks itself', () => {
    expect(input).not.toMatch(/pointer-events:\s*none/);
  });

  it('covers the drawn box exactly', () => {
    expect(px(input, 'width')).toBe(px(box, 'width'));
    expect(px(input, 'height')).toBe(px(box, 'height'));
    expect(input).toMatch(/(?:^|;)\s*left:\s*0(?:px)?\s*;/);
    expect(input).toMatch(/margin:\s*0/);
  });

  it('stays unseen, so the drawn box is what shows', () => {
    expect(input).toMatch(/opacity:\s*0\b/);
    expect(input).toMatch(/position:\s*absolute/);
  });
});
