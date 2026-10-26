// TABBING THROUGH SETUP SHOWED NOTHING AT ALL.
//
// Reported from the Linux box, 2026-10-23: "Tab through the onboarding
// screens. Nothing shows which control has focus." The app kills the browser's
// ring on purpose — `*:focus, *:focus-visible { outline: none }`, because the
// keyboard grammar is the app's own, J and K and Tab for the tabs — and the
// walk is the one place that grammar does not apply: its screens are a form,
// with buttons, a list and a field, and Tab is the only way round them without
// a mouse.
//
// ONE RULE FOR THE WHOLE WALK, not a ring per class. A list of classes goes
// stale the first time a screen gains a button; everything focusable inside a
// walk screen is ringed.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tabStop } from '../renderer/src/onboarding.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const css = read('renderer/src/styles.css');
const walk = read('renderer/src/components/Onboarding.tsx');

/** The body of the rule one selector is in, whether or not it shares it. */
const rule = (sel) => {
  const at = css.indexOf(`\n${sel}`);
  expect(at, `no rule for ${sel}`).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf('}', at));
};

describe('the walk rings the control the keyboard is on', () => {
  it('still draws no ring anywhere else, which is the app’s own grammar', () => {
    expect(css).toContain('*:focus, *:focus-visible { outline: none; }');
  });

  it('rings every control on a walk screen', () => {
    const ring = rule('.fr-screen :is(button, [role="option"], input, textarea, a):focus-visible');
    expect(ring).toMatch(/outline: [^;]*var\(--accent\)/);
    expect(ring).toContain('outline-offset');
  });

  it('rings the two buttons on the leave card, which stands outside the screen', () => {
    const ring = rule('.fr-stay-scrim button:focus-visible');
    expect(ring).toMatch(/outline: [^;]*var\(--accent\)/);
  });

  // AND THE RING NEEDED A KEY THAT REACHED IT. Measured in the built renderer
  // on 2026-10-24: Tab moved no focus at all on a setup screen, because the
  // window handler's tab rotation claimed the press, blurred the active
  // element and switched a tab behind the walk. The ring had nothing to draw on.
  it('leaves Tab to the walk while a walk screen covers the app', () => {
    const app = read('renderer/src/App.tsx');
    const start = app.indexOf("if (e.key === 'Tab') {");
    const branch = app.slice(start, app.indexOf('return;', app.indexOf('setSelected(0);', start)));
    expect(branch).toContain('!walkScreenRef.current');
    // The guard is in the condition that decides whether to take the press.
    expect(branch.indexOf('!walkScreenRef.current')).toBeLessThan(branch.indexOf('if (!onTheTabs) return;'));
  });

  // AND THE RING STILL HAD NOTHING TO DRAW ON. Measured in the real app on
  // Linux, 2026-10-24, after the rotation was called off: one Tab on the plan
  // screen put focus on `BUTTON.workspace-tab "Threads"` — the sidebar, behind
  // an opaque screen. A walk screen holds its focus the way a dialog does.
  describe('and Tab stays on the screen that is covering the window', () => {
    it('starts at the first control when focus is not on the screen', () => {
      expect(tabStop(4, -1)).toBe(0);
      expect(tabStop(4, -1, true)).toBe(3);
    });

    it('moves to the next control and wraps at either end', () => {
      expect(tabStop(4, 0)).toBe(1);
      expect(tabStop(4, 2)).toBe(3);
      expect(tabStop(4, 3)).toBe(0);
      expect(tabStop(4, 0, true)).toBe(3);
      expect(tabStop(4, 3, true)).toBe(2);
    });

    it('stays on the one control a screen with one has', () => {
      expect(tabStop(1, 0)).toBe(0);
      expect(tabStop(1, -1)).toBe(0);
    });

    // THE CASE THAT MUST NOT MATCH: a screen with nothing to focus asks for
    // nothing, rather than for control number zero that is not there.
    it('asks for no control on a screen that has none', () => {
      expect(tabStop(0, -1)).toBe(-1);
      expect(tabStop(0, 0)).toBe(-1);
    });

    it('is what the window handler moves focus with', () => {
      const app = read('renderer/src/App.tsx');
      // Its own branch, ABOVE the tab rotation so the press never reaches it.
      // It sits outside the rotation's branch rather than at the top of it so
      // that `setHoveredId(null)` stays next to the Tab it belongs to, which
      // the-keys-are-said-where-she-can-see-them.test.mjs measures by distance.
      const trap = app.indexOf("if (e.key === 'Tab' && walkScreenRef.current) {");
      const rotation = app.indexOf("if (e.key === 'Tab') {");
      expect(trap).toBeGreaterThan(-1);
      expect(trap).toBeLessThan(rotation);
      expect(app.slice(trap, rotation)).toContain('tabStop(');
    });
  });

  it('keeps the folder list’s own highlight under the keyboard', () => {
    // The rows light one at a time with the arrows and with the pointer. Focus
    // lights the same row, so Tab and the arrows cannot disagree about which
    // row Return will take. Since 2026-10-26 both go through `light`, which
    // also records WHICH of the two lit it
    // (tests/a-card-drawn-under-a-still-mouse-lights-no-row).
    expect(walk).toMatch(/onFocus=\{\(\) => light\(i, 'key'\)\}/);
    expect(walk).toMatch(/onFocus=\{\(\) => light\(recent\?\.length \?\? 0, 'key'\)\}/);
    expect(walk).toMatch(/onFocus=\{\(\) => light\(\(recent\?\.length \?\? 0\) \+ 1, 'key'\)\}/);
  });
});
