// ON A MAC THE DARK GROUND IS GLASS (w-b4dbfc0f31).
//
// The owner could not settle on a colour for the ground the sidebar sits on,
// and pointed at another Mac app whose ground is frosted glass over the
// desktop. Measured off that picture: the ground is about four fifths a warm
// dark tint and one fifth the blurred desktop; the card is solid, 8px in from
// the window's right and bottom edges, with 10px corners. Nothing did this
// before: the window was opaque #1a1a1c and the page painted an opaque ground.
//
// Covered: a Mac window gets the system's blur and tells its page so; Linux and
// Windows keep the opaque window and are never told; the page goes glass only
// in the dark look, and Light keeps its opaque ground.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { GLASS_ARG, glassWindow } from '../main/window-glass.mts';

const read = (f: string) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const nav = read('renderer/src/workspace-navigation.css');

function rule(selector: string): string {
  const at = nav.indexOf(`${selector} {`);
  expect(at, `${selector} is missing`).toBeGreaterThan(-1);
  return nav.slice(at, nav.indexOf('}', at));
}

const DARK_GLASS = ':root[data-glass]:not([data-theme="light"])';

describe('the window', () => {
  it('asks a Mac for its blur behind a see-through page, and tells the page', () => {
    const w = glassWindow('darwin');
    expect(w.vibrancy).toBe('under-window');
    expect(w.visualEffectState).toBe('active');
    expect(w.backgroundColor).toBe('#00000000');
    expect(w.additionalArguments).toEqual([GLASS_ARG]);
  });

  it('sets the traffic lights where the reference has them, 25pt in and 25pt down', () => {
    // The lights are 14pt across, so their top-left corner is 7pt short of
    // the centre. The system default had the first one's centre at 19pt.
    expect(glassWindow('darwin').trafficLightPosition).toEqual({ x: 18, y: 18 });
    expect(glassWindow('linux')).not.toHaveProperty('trafficLightPosition');
  });

  it('keeps the opaque window on Linux and Windows, where there is no blur to show', () => {
    for (const platform of ['linux', 'win32'] as const) {
      const w = glassWindow(platform);
      expect(w).toEqual({ backgroundColor: '#1a1a1c', additionalArguments: [] });
    }
  });

  it('is what the main window is made with', () => {
    const main = read('main/main.mts');
    const made = main.slice(main.indexOf('window = new BrowserWindow({'));
    const options = made.slice(0, made.indexOf('\n  });'));
    expect(main).toContain('const { additionalArguments, ...glass } = glassWindow(process.platform);');
    expect(options).toContain('...glass,');
    expect(options).toMatch(/webPreferences: \{[^}]*additionalArguments,/);
    expect(options).not.toMatch(/backgroundColor:/);
  });

  // The preload marking the page from that argument is run for real in
  // tests/the-flat-window-mark-does-not-drop-the-bridge.
});

describe('the page', () => {
  it('lets the blurred desktop through the dark ground, turned down by the theme\'s own ground', () => {
    const body = rule(`${DARK_GLASS} body`);
    const mix = body.match(/color-mix\(in srgb, var\(--bg\) (\d+)%, transparent\)/);
    expect(mix, 'the ground is the theme colour mixed with clear').not.toBeNull();
    const tint = Number(mix![1]);
    expect(tint).toBeGreaterThan(50);
    expect(tint).toBeLessThan(90);
    expect(rule(`${DARK_GLASS} body::before`)).toMatch(/content: none/);
  });

  it('keeps the card solid, so nothing on it changes', () => {
    const card = rule(`${DARK_GLASS} .workspace-layout::before`);
    expect(card).toMatch(/background: linear-gradient\(var\(--skin-pane\), var\(--skin-pane\)\), var\(--skin-image\) center \/ cover no-repeat fixed var\(--bg\)/);
  });

  it('sets the card 8px in from the right and the foot, with the document card\'s corner', () => {
    const card = rule(`${DARK_GLASS} .workspace-layout::before`);
    expect(card).toMatch(/right: 8px/);
    expect(card).toMatch(/bottom: 8px/);
    expect(card).toMatch(/border-radius: var\(--artifact-corner\)/);
    expect(rule(`${DARK_GLASS} .app.workspace-layout`)).toMatch(/padding-right: 8px; padding-bottom: 8px/);
    expect(rule(`${DARK_GLASS} .home-sky`)).toMatch(/border-radius: var\(--artifact-corner\)/);
  });

  it('leaves Light opaque: every glass rule is for the dark look only', () => {
    const glassRules = [...nav.matchAll(/^([^{}\n]*\[data-glass\][^{}\n]*)\{/gm)].map((m) => m[1]);
    expect(glassRules.length).toBeGreaterThan(0);
    for (const selector of glassRules) expect(selector).toContain(DARK_GLASS);
  });
});
