// THE TRAY IS DRAGGED WITH THE POINTER AND NEVER SAID SO.
//
// QA drove the tray on 2026-10-25 and reported it as a bug that it sat over
// another app's button, having no idea it could be moved (w-6da6d4ad24). The
// page's own comment admitted it: "the tag is movable as it is, with nothing
// drawn to say so". The only sentence saying otherwise is in Settings, and the
// tag went on showing the plain arrow, so pointing at it taught you it was a
// button. So the pointer says it: the hand over the glass, and the plain arrow
// everywhere else, because the window is wider than the
// glass and a click in that band belongs to whatever is underneath.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../renderer/src/corner-tag/corner-tag.css', import.meta.url), 'utf8');
// Every rule for a selector, not the first: the tag is written in two places.
const rule = (sel) => [...css.matchAll(new RegExp(`${sel.replace(/[.[\]"()=:*]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'g'))].map((m) => m[1]).join(' ');

describe('pointing at the tray', () => {
  it('shows the hand that means this moves', () => {
    expect(rule('.ct-tag')).toMatch(/cursor:\s*grab\s*;/);
  });

  it('closes the hand while it is being dragged', () => {
    expect(rule('.ct-tag.is-dragging')).toMatch(/cursor:\s*grabbing/);
  });

  // The corners used to show resize arrows and resize it; they move it now
  // (tests/the-tray-changes-size-only-from-its-size-buttons).
  it('shows no resize arrow anywhere on it', () => {
    expect(css).not.toMatch(/-resize/);
  });

  it('leaves the plain arrow over the clear band around the glass', () => {
    expect(rule('body')).toMatch(/cursor:\s*default/);
    expect(rule('.ct-frame')).not.toMatch(/cursor:\s*grab/);
  });
});
