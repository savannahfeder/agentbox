// NOTHING IN A LIGHT THEME IS A PLAIN WHITE SLAB.
//
// Her rule, 2026-09-23, on the coding agent cards: Frost Haze and the other
// light modes should never use a plain white background for a component. She
// was looking at the new picker, whose face was `--control-face`.
//
// WHAT THAT TOKEN ACTUALLY IS, measured in the running app the same day rather
// than read off the stylesheet:
//
//   Frost Haze     --control-face: rgba(255, 255, 255, .453)   a WHITE film
//   plain light    --control-face: #fefefe                     white
//   Valley Haze    --control-face: rgba(255, 255, 255, .055)
//
// Over a pale photograph a 45% white film reads as exactly the white slab she
// named. `--film-strong` is the opposite construction: it is a tint OF the
// theme, dark on a light one and light on a dark one, so it cannot be white in
// either direction.
//
//   light  --film-strong: rgba(17, 25, 48, .075)
//   dark   --film-strong: rgba(255, 255, 255, .1)
//
// This guards the picker specifically, and the token rule generally, because a
// later hand reaching for "the control colour" will reach for `--control-face`
// and be wrong here for a reason that is invisible on a dark theme.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const css = fs.readFileSync(path.join(root, 'renderer/src/styles.css'), 'utf8');

/** One rule's body, by selector, so a claim is about that rule and not the file. */
function ruleBody(selector) {
  const at = css.indexOf(`\n${selector} {`);
  if (at < 0) return null;
  const open = css.indexOf('{', at);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

/**
 * EVERY CONTROL THAT WAS STILL A WHITE FILM, swept 2026-09-24 on her word.
 *
 *  These four were the rest of them, all on the Settings screen. Measured in
 *  Frost Haze before the change: the step buttons, the lit segment and the
 *  ghost button all resolved to `rgba(255,255,255,.455)`; the slider thumb is a
 *  pseudo-element and was read off the stylesheet.
 *
 *  The old choice was deliberate and is quoted in styles.css: "a control is a
 *  film of white and a hairline, and it gets BRIGHTER to say live, never
 *  darker, because darker is a hole in the picture". True on a dark theme,
 *  backwards on a light one. `--film-strong` keeps the intent and drops the
 *  assumption: a film that CONTRASTS with the backdrop, either way round.
 */
const SWEPT = ['.set-step button', '.set-seg button.on', '.set-ghost', '.set-range::-webkit-slider-thumb'];

describe('no control is left painted with the white film', () => {
  it('paints all four off the theme tint', () => {
    for (const selector of SWEPT) {
      const body = ruleBody(selector);
      expect(body, selector).not.toBeNull();
      expect(body, selector).toContain('background: var(--film-strong)');
      // `--control-face-line` may still appear here and is harmless: it is the
      // hairline, not the fill. What this file is about is what a control is
      // FILLED with, which the global check below holds for the whole sheet.
      expect(body, selector).not.toMatch(/background:\s*var\(--control-face\)/);
    }
  });

  // AND `--control-face` IS NOT LEFT LYING ABOUT AS A BACKGROUND. It still
  // exists and is still read for borders and shadows, where white is harmless;
  // what must not come back is a control FILLING itself with it.
  it('leaves no rule filling a background with the white film', () => {
    expect(css.match(/background:\s*var\(--control-face\)/g) ?? []).toHaveLength(0);
  });
});

describe('the picker never paints itself white', () => {
  it('takes its face from the theme tint, not the white film', () => {
    const face = ruleBody('.set-picker-now');
    expect(face).not.toBeNull();
    expect(face).toContain('background: var(--film-strong)');
    expect(face).not.toContain('--control-face');
    expect(face).not.toContain('--surface');
  });

  it('never writes a literal white anywhere in its own rules', () => {
    for (const selector of ['.set-picker-now', '.set-picker-menu', '.set-picker-row']) {
      const body = ruleBody(selector);
      expect(body, selector).not.toBeNull();
      // `white-space` is a layout property and not a colour; dropping it first
      // is cheaper than a lookahead nobody will be able to read later.
      const colours = body.toLowerCase().replace(/white-space[^;]*;/g, '');
      expect(colours, selector).not.toMatch(/#fff\b|#ffffff\b|\bwhite\b|255,\s*255,\s*255/);
    }
  });

  // THE TOKEN ITSELF, both ways round, so this test fails if somebody redefines
  // `--film-strong` as a white film and quietly reintroduces the defect.
  it('keeps --film-strong a tint of the theme in both directions', () => {
    const light = css.slice(0, css.indexOf('[data-theme="dark"]'));
    expect(light).toMatch(/--film-strong:\s*rgba\(17,\s*25,\s*48/);
    // And on the dark side it is the light film, which is correct there.
    expect(css).toMatch(/--film-strong:\s*rgba\(255,\s*255,\s*255/);
  });
});
