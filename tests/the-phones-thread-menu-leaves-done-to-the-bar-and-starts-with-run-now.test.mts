// The desktop's ⋯ menu lifts Done out to the button beside it (ThreadMenu.tsx
// `splitDone`), so the menu never says it twice, and it offers Run now before
// Later (`threadMenuRows`). The phone's ⋯ sheet ended on "Close this thread"
// with Done already in its bar, and put Later first with Run now under it.
// Found by the phone parity audit of 2026-11-21.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const desk = fs.readFileSync('renderer/src/threads/ThreadMenu.tsx', 'utf8');
const menu = fs.readFileSync('mobile/src/ui/ThreadMenu.tsx', 'utf8');
const parity = fs.readFileSync('mobile/parity.mjs', 'utf8');

describe("the phone's thread menu", () => {
  it('on the desktop, Done leaves the menu for its button', () => {
    expect(desk).toMatch(/const \{ done, menu: rows \} = splitDone\(threadMenuRows\(/);
    expect(desk.indexOf("label: 'Run now'")).toBeLessThan(desk.indexOf("label: 'Later'"));
  });
  it('has no Close row, since Done is in the bar', () => {
    expect(menu).not.toMatch(/Close this thread/);
    expect(parity).toMatch(/'thread:done': \{ phone: THREAD, find: 'accessibilityLabel="Mark done"' \}/);
  });
  it('offers Run now before Later', () => {
    expect(menu.indexOf('label="Run now"')).toBeGreaterThan(0);
    expect(menu.indexOf('label="Run now"')).toBeLessThan(menu.indexOf('<SheetHead>Later</SheetHead>'));
  });
});
