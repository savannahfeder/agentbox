// THE FIRST WEEK ON A REAL IPHONE THROUGH THE RELAY (2026-10-12), four notes:
//
// - "that little reload button ... is overlaying other buttons". The update
//   button in the side rail was renamed (sb-update-row, sb-update-card) and
//   the phone's rule still hid only `.sb-update`, so on a phone with an update
//   waiting it sat over View and filters, and the gear was out of reach.
// - "We probably need a way in Settings for me to configure [notifications]".
//   The phone's own alerts page existed (Settings, then Phone) but Settings
//   opened on General, and with the gear covered it could not be opened at all.
// - "The MD file is weirdly scrollable to the left ... always bouncing to the
//   left and right". The document's own scroller took a wide table's width, so
//   every slightly diagonal swipe moved it sideways.
// - "we lost the nice colored background" and the band behind the clock does
//   not run into the top bar. Sampled off the screenshot: the band (26, 24, 23),
//   the wall's own colour; the screen under it (31, 29, 28) to (37, 32, 30),
//   because the desktop's card wash, rgba(36, 34, 33, 0.55), covered the whole
//   phone and dimmed the wall's orange glow by more than half.
//
// Measured by reading renderer/src/phone.css, Settings.tsx and phone-screen.ts.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const css = read('renderer/src/phone.css').replace(/\/\*[\s\S]*?\*\//g, '');
const at = css.indexOf('@media (max-width: 700px), (max-height: 520px)');
const rules = [...css.slice(at).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }));
const bodiesFor = (piece) => rules.filter((r) => r.selector.split(',').some((s) => s.trim().endsWith(piece))).map((r) => r.body).join(';');
const last = (piece, prop) => {
  const all = [...bodiesFor(piece).matchAll(new RegExp(`(?:^|[;{\\s])${prop}:\\s*([^;]+)`, 'g'))];
  return all.length ? all[all.length - 1][1].trim() : undefined;
};

describe('on a phone, the top-right corner', () => {
  it('shows Settings and nothing else of the side rail, whatever the rail grows next', () => {
    expect(last('.workspace-navigation .workspace-utilities > :not(button[aria-label="Settings"])', 'display')).toBe('none');
    expect(last('.workspace-navigation .workspace-bottom > :not(.workspace-utilities)', 'display')).toBe('none');
  });
});

describe('on a phone, Settings', () => {
  it('opens on the phone\'s own page, where its alerts are set', () => {
    const settings = read('renderer/src/components/Settings.tsx');
    expect(settings).toMatch(/onPhone\(\) \? 'phone' : ''/);
  });
  it('points a phone without the secure address at Anywhere, not Tailscale', () => {
    const alerts = read('renderer/src/phone-alerts.ts');
    expect(alerts).toMatch(/'needs-secure': '[^']*Anywhere/);
    expect(alerts).not.toMatch(/'needs-secure': '[^']*Tailscale/);
  });
});

describe('on a phone, a document', () => {
  it('scrolls up and down only; a wide table or code block scrolls sideways on its own', () => {
    expect(last('.doc-rich', 'overflow-x')).toBe('hidden');
    expect(last('.doc-rich', 'touch-action')).toBe('pan-y');
    expect(last('.doc-rich .ProseMirror table', 'display')).toBe('block');
    expect(last('.doc-rich .ProseMirror table', 'overflow-x')).toBe('auto');
    expect(last('.doc-rich .ProseMirror table', 'touch-action')).toMatch(/pan-x/);
    expect(last('.doc-rich .ProseMirror pre', 'max-width')).toBe('100%');
  });
  it('and so does a message in a thread', () => {
    expect(last('.focus-body table', 'display')).toBe('block');
    expect(last('.focus-scroll', 'overflow-x')).toBe('hidden');
    expect(last('.focus-scroll', 'touch-action')).toBe('pan-y');
  });
});

describe('on a phone, the background', () => {
  it('is the wall itself, glow and all, not the desktop card\'s wash over it', () => {
    expect(last('.workspace-layout::before', 'background')).toBe('none');
  });
  it('so the tabs show the wall, and what is solid wears the wall\'s own colour', () => {
    expect(last('.list-pane > .th-bar', 'background')).toBe('transparent');
    expect(last('.th-pop', 'background')).toBe('var(--bg)');
    expect(last('.focus-pane .ts-panel', 'background')).toBe('var(--bg)');
  });
  it('and the colour behind the clock is set again once the inbox has drawn, however long that takes', () => {
    const screen = read('renderer/src/phone-screen.ts');
    expect(screen).toMatch(/observe\(document\.body, \{ childList: true, subtree: true \}\)/);
  });
});
