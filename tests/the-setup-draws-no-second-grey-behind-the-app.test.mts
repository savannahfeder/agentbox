// THE SETUP DRAWS NO SECOND GREY BEHIND THE APP (w-fbe5e95dea, 2026-11-10).
//
// The founder, on the setup in dark mode: the grey panel behind the app on the
// right "doesn't work very well ... probably because the gray is very similar
// to the gray of our product's background." Of the options pictured, the
// panel and its caption are gone, and the app stands on the page with its own
// edge and shadow, in light and in dark.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../renderer/src/components/setup-split.css', import.meta.url), 'utf8');

describe('the right side of the setup', () => {
  it('has no panel of its own', () => {
    expect(css).toMatch(/\.setup-split \.ss-right \{[^}]*background: none;/);
    expect(css).not.toMatch(/\.setup-split \.ss-right \{[^}]*var\(--sky-frame/);
  });
  it('and no caption over the app', () => {
    expect(css).toMatch(/\.setup-split \.ss-cap \{ display: none; \}/);
  });
});
