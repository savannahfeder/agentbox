// THE WAY OUT OF SETTINGS, and the invariant that keeps it findable.
//
// She was stuck in a screen with a working keyboard shortcut and a button she
// did not find, which is the same as a screen with no way out. So there are
// three things to keep true, and each of them has already been wrong once:
//
//   1. There is a POINTER way out. A shortcut on its own is a trapdoor for
//      anyone whose Escape key is not to hand.
//   2. It is ABOVE THE TITLE IN THE LEFT COLUMN, where she looked for it, and
//      not in the far corner of the pane, where she found it only after asking.
//   3. It still says `esc`, beside the arrow, so the key and the button are one
//      control rather than two facts to learn.
//
// And the keyboard listener stays, because moving where the word is printed
// must not quietly remove the thing the word is about.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tsx = fs.readFileSync(path.join(root, 'renderer/src/components/Settings.tsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'renderer/src/styles.css'), 'utf8');

// The `.set-nav-top` block: the strip above the nav list, which is where she
// said to put it. Everything between the opening tag and its closing div.
const navTop = tsx.slice(tsx.indexOf('<div className="set-nav-top">'), tsx.indexOf('<div className="set-nav-scroll">'));

describe('the way out of settings', () => {
  it('is a button in the strip above the title, not only a shortcut', () => {
    expect(navTop).toContain('className="set-nav-back"');
    expect(navTop).toMatch(/onClick=\{onClose\}/);
  });

  it('puts the arrow before the title, because that is where she looked', () => {
    expect(navTop.indexOf('set-nav-back')).toBeLessThan(navTop.indexOf('set-nav-title'));
  });

  it('draws an arrow, not a word alone', () => {
    const back = navTop.slice(navTop.indexOf('set-nav-back'), navTop.indexOf('</button>'));
    expect(back).toContain('<svg');
    expect(back).toContain('esc');
  });

  it('has no button in the top-right corner any more', () => {
    expect(tsx).not.toContain('set-esc');
    expect(css).not.toContain('.set-esc');
  });

  it('still closes on the Escape key', () => {
    expect(tsx).toMatch(/e\.key === 'Escape'[\s\S]{0,80}onClose\(\)/);
  });

  it('opts the button out of the window drag region, or the press never lands', () => {
    // `.set-nav-top` is a drag region for the frameless window: a button inside
    // one that does not say no-drag moves the window instead of being clicked.
    expect(css).toMatch(/\.set-nav-top\s*\{[^}]*-webkit-app-region:\s*drag/);
    expect(css).toMatch(/\.set-nav-back\s*\{[^}]*-webkit-app-region:\s*no-drag/);
  });
});
