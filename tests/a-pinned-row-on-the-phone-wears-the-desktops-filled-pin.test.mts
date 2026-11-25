// A pin nobody could find read as a pin that did nothing, so the desktop's row
// pin took a filled head in the second ink, a step stronger than the faint
// marks beside it (2026-11-23). The phone parity round of 2026-11-25 found the
// phone's row still drawing the old outline in the faintest ink.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe("a pinned row's pin on the phone", () => {
  it('is drawn as the desktop draws it: dim ink, head filled', () => {
    const css = read('renderer/src/threads/pages.css');
    expect(css).toMatch(/\.th-pin \{[^}]*color: var\(--text-dim\)/);
    expect(css).toContain('.th-pin path:first-child { fill: currentColor; }');
    expect(read('mobile/src/app/index.tsx')).toMatch(/accessibilityLabel="Pinned"[^\n]*<Pin filled tint=\{color\.dim\} \/>/);
  });

  it('fills only the head, and only when asked, so the menu row keeps its outline', () => {
    const icons = read('mobile/src/ui/icons.tsx');
    expect(icons).toMatch(/export const Pin = \(\{ size = 13, tint = color\.faint, filled = false \}/);
    expect(icons).toMatch(/<Path d="M8 3h8l-1\.5 6 3\.5 3\.5H6L9\.5 9z" fill=\{filled \? tint : 'none'\} \/>/);
    expect(read('mobile/src/ui/ThreadMenu.tsx')).toContain('lead={<Pin size={15} />}');
  });
});
