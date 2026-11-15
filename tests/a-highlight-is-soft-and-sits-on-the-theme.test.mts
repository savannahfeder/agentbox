// A HIGHLIGHT IS SOFT AND SITS ON THE THEME (w-59b4e9f32a).
//
// "When you highlight text I think that blue is too dark ... this feels like
// 2002 Microsoft." The app set no ::selection anywhere, so every highlight was
// the browser's own: in the built app's room chat, words drawn on a solid,
// saturated blue block, the same in Dark and Light.
//
// Now each theme carries its own highlight, a see-through wash in the way
// Slack's is, and the words keep their own colour on it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../renderer/src/styles.css', import.meta.url), 'utf8');
const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(([, sel, body]) => ({ sel: sel.split(',').map((s) => s.trim()), body }));
const ruleFor = (selector) => rules.find((r) => r.sel.includes(selector));
const alphaOf = (selector) => {
  const value = ruleFor(selector)?.body.match(/--select:\s*([^;]+);/)?.[1].trim();
  const rgba = value?.match(/^rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)$/);
  return rgba ? Number(rgba[1]) : null;
};

describe('a highlight', () => {
  const selection = ruleFor('::selection');

  it('is the app’s own, not the browser’s', () => {
    expect(selection?.body).toMatch(/background(-color)?:\s*var\(--select\)/);
  });

  it('leaves the words their own colour', () => {
    expect(selection?.body).not.toMatch(/(^|[;\s])color:/);
  });
});

describe('each theme’s highlight', () => {
  for (const [name, selector] of [['Light', ':root'], ['Dark', ':root[data-theme="dark"]']]) {
    it(`is see-through in ${name}, so the ground shows through it`, () => {
      const alpha = alphaOf(selector);
      expect(alpha, `${selector} --select`).not.toBeNull();
      expect(alpha).toBeGreaterThan(0.1);
      expect(alpha).toBeLessThanOrEqual(0.45);
    });
  }

  it('is never a solid block', () => {
    for (const selector of [':root', ':root[data-theme="dark"]']) expect(alphaOf(selector)).toBeLessThan(1);
  });
});
