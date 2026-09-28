// ⌘1 TO ⌘4 GO STRAIGHT TO A SECTION OF THE SIDEBAR.
//
// It was ⌘⌥ and an arrow from 2026-09-14 until 2026-09-23, when she took it
// apart for two reasons that are each enough on their own: "3 keys is just a
// bit much. That actually activates my tile application, which moves the
// application around different parts of the screen and makes it jump."
//
// A shortcut that moves her WINDOW while she is trying to move between sections
// is worse than no shortcut, and nothing in this app can see that collision
// happen, so no test could have caught it. What she asked for instead is two
// keys: "One key is probably too little, though." And she named what she
// actually does with it, which is why this goes straight there rather than
// cycling: "I'm always jumping between inbox and in progress."
import { expect, it } from 'vitest';
import { sidebarSlot } from '../renderer/src/workspace-navigation.mjs';
import { readFileSync } from 'node:fs';

it.each([['1', 1], ['2', 2], ['3', 3], ['4', 4]])('accepts ⌘%s and nothing near it', (key, slot) => {
  expect(sidebarSlot({ key, metaKey: true })).toBe(slot);
  for (const extra of [{ metaKey: false }, { altKey: true }, { ctrlKey: true },
    { shiftKey: true }, { repeat: true }, { defaultPrevented: true }]) {
    expect(sidebarSlot({ key, metaKey: true, ...extra })).toBe(0);
  }
});

// ⌥ IS EXCLUDED ON PURPOSE AND IT IS THE WHOLE POINT OF THE CHANGE. Her tiling
// app answers the old chord first, so a handler that still accepted ⌘⌥ would
// put her back where she started.
it('refuses the old chord outright', () => {
  expect(sidebarSlot({ key: 'ArrowDown', metaKey: true, altKey: true })).toBe(0);
  expect(sidebarSlot({ key: 'ArrowUp', metaKey: true, altKey: true })).toBe(0);
  expect(sidebarSlot({ key: '1', metaKey: true, altKey: true })).toBe(0);
});

it.each(['5', '0', 'Tab', 'ArrowLeft', 'a'])('leaves %s alone', (key) => {
  expect(sidebarSlot({ key, metaKey: true })).toBe(0);
});

it('hands Tab to the browser and guards editing, dialogs and opened tasks', () => {
  const app = readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  expect(app).toContain("if (e.key === 'Tab') return;");
  expect(app).toContain('if (slot && !inInput && !modal && !inFullScreen)');
  expect(app).not.toContain("if (e.key === 'Tab' && modal !== 'compose')");
});

// Scheduled comes and goes with whether anything is deferred, so on a day it is
// absent the list is three long and ⌘4 has nowhere to land.
it('does nothing at all on a number past the end of the list', () => {
  const app = readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  expect(app).toContain('const want = order[slot - 1];');
  expect(app).toContain('if (!want) return;');
});
