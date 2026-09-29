// ⌘K OPENS WHERE A COMMAND PALETTE OPENS, AND ONLY ⌘K MOVES.
//
// She was right. It sat at 12vh from the top of the window with a panel a fixed
// 371.5px tall, which at her 1440x944 window is 113px of nothing above it and
// 459px below: four times as much emptiness under the box as over it, and its
// top edge landing flush under the tab bar.
//
// The answer came from measuring rather than taste. `scripts/measure-palette-
// elsewhere.mjs` opens 16 real apps in a real browser at 1440x900, presses ⌘K
// and reads the box off the page. Four of them are command palettes rather than
// doc-search overlays — shadcn/ui's CommandDialog, Vercel, Next.js and
// Anthropic's docs — and all four open at top 15% with panels 351 to 484px
// tall, putting their MIDDLES at 34.5%, 36.8%, 37.7% and 41.9%. Median 37.25%.
//
// We match the middle, not the top edge, because our panel is a fixed height
// while theirs grow with content. `place-items: center` with 25vh held under
// the box puts the middle at 50% - 12.5% = 37.5% and HOLDS it at every window
// size. Measured after the change: 37.5% at 1440x944, at 1280x800 and at
// 1728x1080, against 31.7% / 35.2% / 29.2% before.
//
// TWO THINGS THIS TEST EXISTS TO STOP, both of which are silent:
//
//   1. Somebody "tidies" the palette back onto the bare .modal-backdrop, or
//      swaps the centring for a padding-top in vh. Either puts her complaint
//      back and nothing errors.
//   2. Somebody widens the selector to .modal-backdrop and moves snooze,
//      standing instructions, Connect and Settings with it. She asked about ⌘K.
//      She did not ask about those, and STATE.md says so.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'renderer/src/styles.css'), 'utf8');
const palette = fs.readFileSync(path.join(root, 'renderer/src/components/Palette.tsx'), 'utf8');

// The declarations of one rule, by its exact selector, as { prop: value }.
function ruleFor(selector) {
  const at = css.indexOf(selector + ' {');
  if (at === -1) return null;
  const open = css.indexOf('{', at);
  const close = css.indexOf('}', open);
  const out = {};
  for (const part of css.slice(open + 1, close).split(';')) {
    const i = part.indexOf(':');
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

describe('where ⌘K opens', () => {
  it('carries its own backdrop class, so moving it cannot move anything else', () => {
    expect(palette).toContain('className="modal-backdrop palette-backdrop"');
  });

  it('is centred with a held-back skirt, not pinned to the top of the window', () => {
    const rule = ruleFor('.modal-backdrop.palette-backdrop');
    expect(rule, '.modal-backdrop.palette-backdrop is gone from styles.css').not.toBeNull();
    expect(rule['place-items']).toBe('center');
    expect(rule['padding-top']).toBe('0');
    expect(rule['padding-bottom']).toBe('25vh');
  });

  // The arithmetic that number encodes, spelled out so the next reader can see
  // where 25vh came from without re-running the browser.
  it('puts the middle of the palette at 37.5% of the window, at any window size', () => {
    const skirt = 25; // vh, from the rule above
    const middle = 50 - skirt / 2;
    expect(middle).toBe(37.5);

    // The four real command palettes measured 2026-08-20 at 1440x900.
    const measured = { 'Next.js': 34.5, Vercel: 36.8, 'shadcn/ui': 37.7, Anthropic: 41.9 };
    const centres = Object.values(measured).sort((a, b) => a - b);
    const median = (centres[1] + centres[2]) / 2;
    expect(median).toBe(37.25);
    expect(Math.abs(middle - median)).toBeLessThan(1);

    // And it is genuinely lower than where she complained about, at each of the
    // three window sizes measured, not just at one.
    for (const h of [944, 800, 1080]) {
      const panel = 371.5;                       // .palette-list caps the box
      const wasTop = 0.12 * h;                   // the old padding-top: 12vh
      const nowTop = (h - (skirt / 100) * h) / 2 - panel / 2;
      expect(nowTop).toBeGreaterThan(wasTop);
    }
  });

  it('leaves snooze, standing instructions and Settings where they were', () => {
    // Those modals render on the bare `.modal-backdrop`. If the palette rule ever
    // loses its second class, they inherit the move and she never asked for it.
    expect(css).toContain('.modal-backdrop.palette-backdrop {');
    // Connect.tsx went out with the app cut, so the guard covers whichever
    // of these modals the app still has.
    const guarded = ['SchedulePicker.tsx', 'Standing.tsx', 'Connect.tsx']
      .filter((f) => fs.existsSync(path.join(root, 'renderer/src/components', f)));
    expect(guarded.length).toBeGreaterThan(0);
    for (const file of guarded) {
      const src = fs.readFileSync(path.join(root, 'renderer/src/components', file), 'utf8');
      expect(src, `${file} must not have taken the palette's backdrop`).not.toContain('palette-backdrop');
    }
    const base = ruleFor('.modal-backdrop');
    expect(base['padding-top']).toBe('12vh');
    expect(base['place-items']).toBe('start center');
  });

  // The new-task card was placed by her on its own optical centre and is not
  // part of this. It must not drift into agreement with the palette by accident.
  it('does not disturb the new-task card, which she placed herself', () => {
    const compose = ruleFor('.modal-backdrop.compose-backdrop');
    expect(compose['place-items']).toBe('center');
    expect(compose['padding-bottom']).toBe('10vh');
  });
});
