// THE KEYBOARD COVERED THE REPLY BOX ON A PHONE (2026-10-11): "when i try to
// reply the chat field is blocked by the keyboard". An iPhone's keyboard does
// not shrink the page; it shrinks the visual viewport and leaves the layout the
// height it was, so the reply box at the foot of a 100%-tall page sat under the
// keyboard. And the page's own scroll-back (renderer/src/browser-bridge.ts)
// then undid the scroll iOS made to show it. Measured by reading phone.css and
// the bridge: nothing read window.visualViewport's height.
//
// Also here: THE PHONE'S EDGES WERE A COOL GREY against a warm app. Safari
// paints its status bar and toolbar in the page's theme colour, and the only
// one given was the manifest's #16161a, (22, 22, 26); sampled off the
// screenshot the bands were (18, 20, 21) and the list (30, 27, 26).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { keyboardInset, groundColour } from '../renderer/src/phone-screen';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'renderer/src/phone.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe('the room the keyboard takes', () => {
  it('is what the visual viewport lost at the foot', () => {
    expect(keyboardInset({ innerHeight: 852, height: 516, offsetTop: 0 })).toBe(336);
  });
  it('counts the page iOS scrolled up to show the field', () => {
    expect(keyboardInset({ innerHeight: 852, height: 516, offsetTop: 40 })).toBe(296);
  });
  it('is nothing with no keyboard, and never below nothing', () => {
    expect(keyboardInset({ innerHeight: 852, height: 852, offsetTop: 0 })).toBe(0);
    expect(keyboardInset({ innerHeight: 852, height: 860, offsetTop: 0 })).toBe(0);
  });
});

describe('the page on a phone fits above the keyboard', () => {
  it('is as tall as the visual viewport, not the layout', () => {
    expect(css).toMatch(/:root[^{]*\{[^}]*height:\s*var\(--vvh,\s*100%\)/);
  });
  it('and the new-thread page stops at the keyboard too', () => {
    expect(css).toMatch(/\.tc-veil > \.tc-card\s*\{[^}]*bottom:\s*var\(--kb,\s*0px\)/);
  });
});

describe('the colour Safari paints around the page', () => {
  it('is the page\'s own ground: the pane\'s wash laid over the base colour', () => {
    expect(groundColour('rgb(26, 24, 23)', 'rgba(36, 34, 33, 0.55)')).toBe('#201e1d');
  });
  it('is the base colour where there is no wash', () => {
    expect(groundColour('rgb(26, 24, 23)', 'rgba(0, 0, 0, 0)')).toBe('#1a1817');
    expect(groundColour('rgb(244, 241, 236)', '')).toBe('#f4f1ec');
  });
  it('falls back to the warm dark when it cannot read either', () => {
    expect(groundColour('', '')).toBe('#1e1b1a');
  });
  it('and the home-screen manifest no longer says a cool grey', () => {
    const link = fs.readFileSync(path.join(root, 'main/phone-link.mjs'), 'utf8');
    expect(link).not.toMatch(/#16161a/);
    expect(link).toMatch(/theme_color:\s*'#1e1b1a'/);
  });
});
