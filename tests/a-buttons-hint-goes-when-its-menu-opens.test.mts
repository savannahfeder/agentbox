// A BUTTON'S HINT GOES WHEN ITS MENU OPENS (w-f702d60afe, 2026-11-21).
//
// A screen review of a thread with its dots menu open: the "More actions"
// hint sat on top of the menu's first row, cutting off the row the hand-off
// flow needs. The hint plate answered the button under the pointer whether or
// not its menu was open.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');

describe('the hint plate', () => {
  it('says nothing for a button whose menu is open', () => {
    expect(app).toContain("if (!el || !id || !HINTS[id] || el.getAttribute('aria-expanded') === 'true')");
  });
  it('goes the moment the menu opens, without the pointer moving', () => {
    expect(app).toContain("watch.observe(shownHint.el, { attributes: true, attributeFilter: ['aria-expanded'] });");
    expect(app).toContain("shownHint.el.getAttribute('aria-expanded') === 'true') drop();");
  });
});
