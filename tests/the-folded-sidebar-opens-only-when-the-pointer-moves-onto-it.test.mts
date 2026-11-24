// THE FOLDED SIDEBAR OPENS ONLY WHEN THE POINTER MOVES ONTO IT (w-1e52420829, 2026-11-12).
//
// Someone finished the setup by clicking "Open your inbox", then went through
// the whole walkthrough by keyboard with the sidebar wide open: "the sidebar is
// open, but that's not how the app works". The button sits where the sidebar
// is drawn once the setup closes, and Chromium tells an element that appears
// under a resting pointer that the pointer entered it. Entering opened the
// sidebar and nothing closed it, on all five walkthrough steps pictured.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { pointerMoved } from '../renderer/src/sidebar-shrinks.ts';

const nav = fs.readFileSync(new URL('../renderer/src/components/WorkspaceNavigation.tsx', import.meta.url), 'utf8');

describe('a pointer that moved', () => {
  it('moved when it went either way', () => {
    expect(pointerMoved({ movementX: 3, movementY: 0 })).toBe(true);
    expect(pointerMoved({ movementX: 0, movementY: -1 })).toBe(true);
  });
  it('did not move when the page moved under it', () => {
    expect(pointerMoved({ movementX: 0, movementY: 0 })).toBe(false);
  });
});

describe('the folded sidebar', () => {
  it('opens on a pointer that moved over it, never on one it appeared under', () => {
    expect(nav).toMatch(/onMouseMove: \(e: \{ movementX: number; movementY: number \}\) => \{\s+if \(hoverAt\.current \|\| !pointerMoved\(e\)\) return;/);
    expect(nav).not.toMatch(/onMouseEnter: \(\) => \{ hoverAt\.current = setTimeout/);
  });
  it('still waits a moment, and still closes when the pointer leaves', () => {
    expect(nav).toMatch(/hoverAt\.current = setTimeout\(\(\) => onHover\(true\), 140\)/);
    expect(nav).toMatch(/onMouseLeave: \(\) => \{ if \(hoverAt\.current\) clearTimeout\(hoverAt\.current\); hoverAt\.current = null; (cameIn\.current = false; )?onHover\(false\); \}/);
  });
});
