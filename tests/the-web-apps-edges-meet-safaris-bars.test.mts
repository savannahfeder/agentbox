// THE WEB APP'S EDGES MEET SAFARI'S BARS.
//
// What broke (the founder's iPhone screenshot, Safari, dark, 2026-10-26):
// Safari drew the band behind the clock in its own grey, (27, 30, 31), over a
// top bar of (18, 20, 21), and a bright line, (117, 109, 96), ran under the top
// bar and above the inboxes. "Make the borders at top and bottom match the
// safari default so it blends together." Safari 26 ignores theme-color: it
// tints its bars from an element touching the top or bottom edge of the page,
// and stays its own grey when nothing short is there. The page is one fixed
// body, so nothing short touched the top. Now a strip in the page's own ground
// covers the band behind the clock, for Safari to take its colour from, and
// the two lines are gone on a phone. Safari 26 itself cannot run here; the
// strip and the lines are checked, and the look is checked on the phone.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const phone = fs.readFileSync(new URL('../renderer/src/phone.css', import.meta.url), 'utf8');
const screen = fs.readFileSync(new URL('../renderer/src/phone-screen.ts', import.meta.url), 'utf8');
const rule = (sel) => {
  const at = phone.indexOf(`${sel} {`);
  expect(at, `no rule for ${sel}`).toBeGreaterThan(-1);
  return phone.slice(at, phone.indexOf('}', at) + 1);
};

describe('the top edge', () => {
  it('has a strip in the page ground, touching the top, as tall as the band behind the clock', () => {
    const r = rule(':root:root:root .phone-edge-top');
    expect(r).toMatch(/position: fixed;/);
    expect(r).toMatch(/top: 0;/);
    expect(r).toMatch(/left: 0; right: 0;/);
    expect(r).toMatch(/height: max\(12px, env\(safe-area-inset-top, 0px\)\);/);
    expect(r).toMatch(/background: var\(--bg\);/);
    expect(r).toMatch(/pointer-events: none;/);
  });
  it('is put on the page by the phone screen, once', () => {
    expect(screen).toMatch(/className = 'phone-edge-top'/);
    expect(screen).toMatch(/querySelector\('\.phone-edge-top'\)/);
  });
});

describe('the lines', () => {
  it('under the top bar are gone on a phone', () => {
    expect(rule(':root:root:root .workspace-layout > .topbar')).toMatch(/border-bottom: 0;/);
  });
  it('above the inboxes are gone on a phone', () => {
    const r = rule(':root:root:root .list-pane > .th-bar');
    expect(r).not.toMatch(/border-top: 1px/);
    expect(r).toMatch(/border-top: 0;/);
  });
});
