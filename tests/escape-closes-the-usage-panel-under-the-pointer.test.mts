// ESCAPE LEFT THE USAGE PANEL OPEN (F-87, QA batch 004, 2026-10-26).
//
// How it was measured: click "Codex" at the foot of the sidebar, press Escape
// without moving the mouse. The panel stayed; only a click elsewhere closed it.
// Seen on both opens of one session.
//
// The panel opens two ways, a click that pins it and a hover that does not,
// and it is drawn while EITHER is on. Clicking it means hovering it, so the
// click left both on and Escape cleared only the pin. Escape now drops both,
// which is the whole of the fix: the pointer is already inside the box, so
// mouseenter cannot fire again until it leaves and comes back.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const pill = fs.readFileSync(new URL('../renderer/src/components/UsagePill.tsx', import.meta.url), 'utf8');

describe('Escape on the usage panel', () => {
  const onKey = pill.match(/const onKey = \(e: KeyboardEvent\) => \{([\s\S]*?)\n {4}\};/)[1];
  it('drops the hover as well as the pin', () => {
    expect(onKey).toMatch(/setPinned\(false\)/);
    expect(onKey).toMatch(/setHovering\(false\)/);
  });
  it('kills the beat that would turn the hover back on', () => {
    expect(onKey).toMatch(/clearTimeout\(linger\.current\)/);
  });
  it('still only answers Escape, and still stops the key going further', () => {
    expect(onKey).toMatch(/if \(e\.key !== 'Escape'\) return;/);
    expect(onKey).toMatch(/e\.stopPropagation\(\)/);
  });
  it('is drawn while either way of opening it is on, which is why both must go', () => {
    expect(pill).toMatch(/const open = !folded && \(pinned \|\| hovering\);/);
  });
});
