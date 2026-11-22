// The phone app's top bar was 57px: 56px of bar with its line drawn under it,
// so every screen's words sat 1px lower than the website's 56px bar. Measured
// from the bars' bottoms on the preview build and the website, both at 402px
// wide. The View panel opened under the bar moves up with it.
//
// 2026-11-22: the redesign took the line away
// (the-phones-bars-buttons-and-sheets-are-soft), so the bar is the whole 56.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const parts = fs.readFileSync('mobile/src/ui/parts.tsx', 'utf8');
const filters = fs.readFileSync('mobile/src/ui/Filters.tsx', 'utf8');
const bar = parts.slice(parts.indexOf('export function TopBar('), parts.indexOf('\n}\n', parts.indexOf('export function TopBar(')));

describe("the phone app's top bar is 56px", () => {
  it('is 56px with no line to add a 57th', () => {
    expect(fs.readFileSync('mobile/src/ui/theme.ts', 'utf8')).toMatch(/topBar: 56,/);
    expect(bar).toMatch(/height: size\.topBar,/);
    expect(bar).not.toMatch(/borderBottomWidth/);
  });
  it('opens the View panel straight under it', () => {
    expect(filters).toMatch(/top: inset\.top \+ size\.topBar, left: 0/);
    expect(filters).not.toMatch(/size\.topBar \+ 1/);
  });
});
