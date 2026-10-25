// A WEEK OF THE PHONE THROUGH THE RELAY (2026-10-12), four notes:
//
// - "I can't upload files in mobile". A reply to an agent took files by paste
//   and by drop and had no button, and a phone has neither. And the phone posts
//   a picture whole, as base64, so the server's 8 MB cap on a body was a 6 MB
//   photo (main/serve.mjs readBody).
// - "there is too much white space when I'm typing ... the white space expands
//   when I'm typing". With the keyboard up the page was held to the visual
//   viewport's height but not its place: iOS scrolls the window to keep the
//   caret in view, which slid the page up and left a growing band under the
//   reply box. The page is pinned to the visual viewport, top and height.
// - "Not sure how to give feedback on mobile". The phone's corner has no
//   Feedback button, on purpose; its Settings page now offers it.
// - "it's hard to view images like PNG's ... I can't zoom in on them". A
//   picture is fitted to the screen with nothing to enlarge it. It pinches,
//   pans once enlarged, and a double tap enlarges or fits it again.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pinchScale, panLimit, doubleTapScale } from '../renderer/src/phone-screen';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const css = read('renderer/src/phone.css').replace(/\/\*[\s\S]*?\*\//g, '');
const at = css.indexOf('@media (max-width: 700px), (max-height: 520px)');
const rules = [...css.slice(at).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }));
const last = (piece, prop) => {
  const bodies = rules.filter((r) => r.selector.split(',').some((s) => s.trim().endsWith(piece))).map((r) => r.body).join(';');
  const all = [...bodies.matchAll(new RegExp(`(?:^|[;{\\s])${prop}:\\s*([^;]+)`, 'g'))];
  return all.length ? all[all.length - 1][1].trim() : undefined;
};

describe('on a phone, a reply to an agent', () => {
  it('has a button to attach a file or a picture', () => {
    const focus = read('renderer/src/components/Focus.tsx');
    expect(focus).toMatch(/!talkTo\?\.length && onPhone\(\) \?/);
    expect(focus).toMatch(/aria-label="Attach a file or picture"[^>]*onClick=\{pickFiles\}/);
  });
  it('drawn as an icon like the others, not a white box', () => {
    expect(last('.compose-attach', 'background')).toBe('none');
    expect(last('.compose-attach', 'border')).toBe('0');
  });
  it('and the phone\'s server takes a photo of more than 8 MB', () => {
    const limit = /body\.length > (\d+) \* 1024 \* 1024/.exec(read('main/serve.mjs'));
    expect(Number(limit[1])).toBeGreaterThanOrEqual(32);
  });
});

describe('on a phone with the keyboard up', () => {
  it('the page is pinned to what shows, top and height, so iOS has nothing to slide', () => {
    expect(last(':root body', 'position')).toBe('fixed');
    expect(last(':root body', 'top')).toBe('var(--vvtop, 0px)');
    expect(last(':root body', 'height')).toBe('var(--vvh, 100%)');
    expect(read('renderer/src/phone-screen.ts')).toMatch(/setProperty\('--vvtop', `\$\{Math\.round\(vv\.offsetTop\)\}px`\)/);
  });
});

describe('on a phone, feedback', () => {
  it('is on the phone\'s own Settings page, wired to the same card the desktop opens', () => {
    const settings = read('renderer/src/components/Settings.tsx');
    expect(settings).toMatch(/<Group id="phone-feedback" label="Feedback">/);
    expect(settings).toMatch(/<PhonePage onFeedback=\{onFeedback\} /);
    expect(read('renderer/src/App.tsx')).toMatch(/<Settings[\s\S]{0,200}onFeedback=\{\(\) => setFeedbackOpen\(true\)\}/);
  });
  it('and its card says nothing of pasting, dropping or keys a phone does not have', () => {
    expect(last('.fb-hint', 'display')).toBe('none');
    expect(last('.dock-send kbd', 'display')).toBe('none');
  });
});

describe('on a phone, Settings', () => {
  it('keeps the status bar\'s room once, not twice', () => {
    expect(last('.settings-screen', 'padding-top')).toBe('0');
  });
});

describe('on a phone, a picture', () => {
  it('pinches larger and smaller with the fingers, never below fitted or past six times', () => {
    expect(pinchScale({ distance: 100, scale: 1 }, 200)).toBe(2);
    expect(pinchScale({ distance: 100, scale: 2 }, 50)).toBe(1);
    expect(pinchScale({ distance: 100, scale: 1 }, 40)).toBe(1);
    expect(pinchScale({ distance: 100, scale: 4 }, 300)).toBe(6);
  });
  it('a double tap enlarges a fitted picture, and fits an enlarged one again', () => {
    expect(doubleTapScale(1)).toBe(2.5);
    expect(doubleTapScale(2.5)).toBe(1);
    expect(doubleTapScale(1.2)).toBe(1);
  });
  it('pans only as far as the enlarged picture reaches, and not at all when fitted', () => {
    expect(panLimit(300, 1)).toBe(0);
    expect(panLimit(300, 2)).toBe(150);
    expect(panLimit(300, 3)).toBe(300);
  });
  it('takes the fingers itself, so the page does not scroll or zoom under them', () => {
    expect(last('.doc-picture', 'touch-action')).toBe('none');
  });
});
