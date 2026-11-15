// FIRST TRY ON A REAL IPHONE (2026-10-11), four things the desktop's layout
// left behind on a phone:
//
// - "the unshare button just stays visible on the screen at all times". A row
//   shows Share or Unshare on hover; a tap leaves :hover on the row it touched,
//   so the button stayed, hid that row's age, and underlined its title.
// - "not sure how to open the summary on mobile". The summary opens from a
//   rail down the thread's right edge, which the phone layout hid.
// - "icons in the top corner are bunched up". On a team, View and filters
//   wears the faces of whose threads are shown, and the phone squeezed faces
//   and sliders into one 40px button, over the Settings gear.
// - "section at the bottom also feels a tad bit different": the inboxes along
//   the bottom stood on the plain base colour, (26, 24, 23), under a list drawn
//   in the pane's wash over it, (32, 30, 29).
//
// Measured by reading renderer/src/phone.css against those screenshots.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'renderer/src/phone.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const at = css.indexOf('@media (max-width: 700px), (max-height: 520px)');
const rules = [...css.slice(at).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }));
const bodiesFor = (piece) => rules.filter((r) => r.selector.split(',').some((s) => s.trim().endsWith(piece))).map((r) => r.body).join(';');
const last = (piece, prop) => {
  const all = [...bodiesFor(piece).matchAll(new RegExp(`(?:^|[;{\\s])${prop}:\\s*([^;]+)`, 'g'))];
  return all.length ? all[all.length - 1][1].trim() : undefined;
};

describe('on a phone, a row', () => {
  it('never shows the desktop\'s Share or Unshare button', () => {
    expect(last('.th-row-act', 'display')).toMatch(/none/);
  });
  it('keeps its age where the button would have hidden it', () => {
    expect(last('.th-table .row .has-act .th-when', 'visibility')).toMatch(/visible/);
  });
  it('draws no underline under a title it was last touched on', () => {
    expect(last('.row .subject', 'text-decoration')).toMatch(/none/);
  });
});

describe('on a phone, View and filters', () => {
  it('is one icon: the faces stay in its menu, not on its button', () => {
    expect(last('.th-disp .th-faces', 'display')).toBe('none');
    // 44, the thumb's floor, since QA batch 005 F-121 measured these three
    // corner icons as the ones a finger kept missing.
    expect(last('.topbar .th-disp', 'width')).toBe('44px');
  });
});

describe('on a phone, the inboxes along the bottom', () => {
  it('stand on the same ground as the list above them', () => {
    // The list stands on the wall itself since 2026-10-12, with no card wash
    // (a-phone-shows-the-wall-scrolls-documents-straight-and-keeps-its-corner-clear),
    // and the bar lets that wall through (w-33511040d7).
    expect(last('.list-pane > .th-bar', 'background')).toBe('transparent');
  });
});

describe('on a phone, the summary', () => {
  it('opens from an icon at the right of the thread\'s top bar', () => {
    const rail = bodiesFor('.focus-pane .ts-rail');
    expect(rail).toMatch(/position:\s*fixed/);
    expect(rail).toMatch(/top:\s*calc\(env\(safe-area-inset-top/);
    expect(last('.focus-pane .ts-rail', 'width')).toBe('44px');
    expect(last('.focus-pane .ts-rail .ts-rail-mark', 'display')).toBe('none');
    // The phone hid the rail outright; that rule is gone.
    expect(rules.some((r) => r.selector.trim().endsWith('.ts-rail') && /display:\s*none/.test(r.body) && !r.selector.includes('data-summary'))).toBe(false);
  });
  // "the summary seems a bit too high" (2026-10-12). Measured in a 393x852
  // page with a 59px status bar, the top bar's middle at 87px: the summary's
  // glyph sat at 85, the ⋯ at 86.5, and the back arrow and the name at 91,
  // pushed down by the desktop's 18px top margin on the header that holds them.
  // Fixed, all four measure 86.5 to 87.
  it('sits on one line with the ⋯, the back arrow and the name: the middle of the top bar', () => {
    // No top margin, and room on the right for the summary icon and the ⋯.
    expect(last('.workspace-task-header', 'margin')).toBe('0 48px 0 0');
    expect(last('.workspace-task-header', 'align-self')).toBe('center');
    expect(last('.focus-pane .ts-rail .ts-rail-ic', 'margin')).toBe('0');
    expect(bodiesFor('.focus-pane .ts-rail')).toMatch(/top:\s*calc\(env\(safe-area-inset-top, 0px\) \+ \(var\(--phone-top, 56px\) - 44px\) \/ 2\)/);
  });
  it('opens as a page of its own over the thread, with its close in reach', () => {
    const panel = bodiesFor('.focus-pane .ts-panel');
    expect(panel).toMatch(/position:\s*fixed/);
    expect(panel).toMatch(/left:\s*0/);
    expect(panel).toMatch(/right:\s*0/);
    expect(last('.focus-pane .ts-panel', 'width')).toBe('auto');
  });
});
