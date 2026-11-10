// ON A MAC THE DARK GROUND IS GLASS (w-b4dbfc0f31).
//
// The owner could not settle on a colour for the ground the sidebar sits on,
// and pointed at another Mac app whose ground is frosted glass over the
// desktop. Measured off that picture: the ground is about four fifths a warm
// dark tint and one fifth the blurred desktop; the card is solid. Nothing did
// this before: the window was opaque #1a1a1c and the page painted an opaque
// ground. On the first picture the owner found the glass edges uneven and too
// thin (40px on top, 8px right and below) and the corners not round enough,
// and asked for the back and forward arrows in the empty top band.
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

  // At 12px the owner found the foot too tight; 20px, with the right kept even.
  it('sets the card 20px in from the right and the foot, with 14px corners', () => {
    const card = rule(`${DARK_GLASS} .workspace-layout::before`);
    expect(card).toMatch(/right: 20px/);
    expect(card).toMatch(/bottom: 20px/);
    expect(card).toMatch(/border-radius: 14px/);
    expect(rule(`${DARK_GLASS} .app.workspace-layout`)).toMatch(/padding-right: 20px; padding-bottom: 20px/);
    expect(rule(`${DARK_GLASS} .home-sky`)).toMatch(/border-radius: 14px/);
    // The sidebar keeps the same place against the card that it has today:
    // 10px below the card's top, level with its foot.
    expect(rule(`${DARK_GLASS} .workspace-navigation`)).toMatch(/top: 60px; bottom: 20px/);
  });

  it('tints the glass with the theme ground at 60%, the shade the owner kept', () => {
    expect(rule(`${DARK_GLASS} body`)).toMatch(/color-mix\(in srgb, var\(--bg\) 60%, transparent\)/);
  });

  it('makes the top band twice the traffic lights\' centre, so they sit in its middle', () => {
    const { y } = glassWindow('darwin').trafficLightPosition!;
    const band = 2 * (y + 7);
    expect(band).toBe(50);
    expect(rule(`${DARK_GLASS} .app.workspace-layout`)).toMatch(new RegExp(`padding-top: ${band}px;`));
    expect(rule(`${DARK_GLASS} .workspace-layout::before`)).toMatch(new RegExp(`top: ${band}px;`));
    // The whole band drags the window, as the 40px strip did.
    expect(rule(`${DARK_GLASS} .workspace-layout::after`)).toMatch(new RegExp(`height: ${band}px`));
  });

  it('puts back and forward in the top band, centred on the lights and just past them', () => {
    const { x, y } = glassWindow('darwin').trafficLightPosition!;
    const arrows = rule(`${DARK_GLASS} .topbar > .back-forward`);
    expect(arrows).toMatch(/position: fixed/);
    // The buttons are 26px tall, so their top is 13px above the lights' centre.
    expect(arrows).toMatch(new RegExp(`top: ${y + 7 - 13}px`));
    // The third light ends at x + 60; the arrows start 16px after it.
    expect(arrows).toMatch(new RegExp(`left: ${x + 60 + 16}px`));
  });

  it('leaves Light opaque: every glass rule is for the dark look only', () => {
    const glassRules = [...nav.matchAll(/^([^{}\n]*\[data-glass\][^{}\n]*)\{/gm)].map((m) => m[1]);
    expect(glassRules.length).toBeGreaterThan(0);
    for (const selector of glassRules) expect(selector).toContain(DARK_GLASS);
  });
});
