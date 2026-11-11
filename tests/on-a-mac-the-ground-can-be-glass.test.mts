// ON A MAC THE GROUND CAN BE GLASS (w-b4dbfc0f31).
//
// The owner could not settle on a colour for the ground the sidebar sits on,
// and pointed at another Mac app whose ground is frosted glass over the
// desktop. Nothing did this before: the window was opaque #1a1a1c and the page
// painted an opaque ground. Over eight rounds of pictures the owner asked for
// even 20px glass edges, rounder corners, the lights centred in a 50px band
// with back and forward, Home and Inbox, Search and New thread in it, and
// approved two frames: Dark at 60% tint with the card outlined, Light at 30%
// with the card flat. They wanted it behind an Alpha switch to try first.
//
// The first build, tried on the owner's Mac: not see-through, the ground's
// colour changed with every key typed, and the band's buttons did nothing.
// Read off the code: the 60% tint sat on top of macOS's darkest material; the
// tint was on body, which Chromium paints as the window's own root colour
// and re-sends with every frame; and the 50px drag strip is `::after`, the
// last thing in the page, so its drag rectangle beat every button under it.
//
// Covered: the switch is off unless turned on, and flips the window live; a
// Mac window can go glass and Linux and Windows never can; the page goes glass
// only when both are true; the root stays clear and the tint lives on the app;
// no drag strip lies over the band's buttons; each look draws its frame.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { GLASS_ARG, applyGlass, glassWindow } from '../main/window-glass.mts';
import { alphaFeatures } from '../main/settings.mts';

const read = (f: string) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const nav = read('renderer/src/workspace-navigation.css');

function rule(selector: string): string {
  const at = nav.indexOf(`${selector} {`);
  expect(at, `${selector} is missing`).toBeGreaterThan(-1);
  return nav.slice(at, nav.indexOf('}', at));
}

const GLASS = ':root[data-glass]';
const DARK = ':root[data-glass]:not([data-theme="light"])';
const LIGHT = 'html:root[data-glass][data-theme="light"]';

describe('the switch', () => {
  it('is off unless somebody turned it on, packaged or not', () => {
    for (const packaged of [true, false]) {
      expect(alphaFeatures({}, { packaged }).glass).toBe(false);
      expect(alphaFeatures({ alphaGlass: null }, { packaged }).glass).toBe(false);
      expect(alphaFeatures({ alphaGlass: true }, { packaged }).glass).toBe(true);
    }
  });

  it('is in Settings, saved, and handed to the window the moment it flips', () => {
    expect(read('renderer/src/components/Settings.tsx')).toMatch(/setWorkspace\('alphaGlass', v\)/);
    expect(read('main/settings.mts')).toMatch(/case 'alphaGlass':\s*saveConfig\(config, \{ alphaGlass: !!value \}\)/);
    expect(read('main/ipc.mts')).toMatch(/if \(payload\?\.key === 'alphaGlass'\) glass\(alphaFeatures\(config\)\.glass\);/);
    expect(read('main/main.mts')).toMatch(/glass: \(on\) => applyGlass\(window, process\.platform, on\)/);
  });
});

describe('the window', () => {
  it('starts a Mac window glass when the switch is on', () => {
    const w = glassWindow('darwin', true);
    expect(w.vibrancy).toBe('sidebar');
    expect(w.visualEffectState).toBe('active');
    expect(w.backgroundColor).toBe('#00000000');
    // The lights are 14pt across: this centres them 25pt in and 25pt down.
    expect(w.trafficLightPosition).toEqual({ x: 18, y: 18 });
  });

  it('starts a Mac window opaque when it is off, still able to go glass later', () => {
    const w = glassWindow('darwin', false);
    expect(w).toEqual({ visualEffectState: 'active', backgroundColor: '#1a1a1c', additionalArguments: [GLASS_ARG] });
    expect(glassWindow('darwin', true).additionalArguments).toEqual([GLASS_ARG]);
  });

  it('keeps the opaque window on Linux and Windows, switch or not', () => {
    for (const platform of ['linux', 'win32'] as const) {
      for (const on of [true, false]) expect(glassWindow(platform, on)).toEqual({ backgroundColor: '#1a1a1c', additionalArguments: [] });
    }
  });

  it('turns a running Mac window glass and back, and touches nothing elsewhere', () => {
    const calls: unknown[][] = [];
    const win = {
      isDestroyed: () => false,
      setVibrancy: (v: unknown) => calls.push(['vibrancy', v]),
      setBackgroundColor: (c: unknown) => calls.push(['background', c]),
      setWindowButtonPosition: (p: unknown) => calls.push(['lights', p]),
    };
    applyGlass(win, 'darwin', true);
    applyGlass(win, 'darwin', false);
    expect(calls).toEqual([
      ['vibrancy', 'sidebar'], ['background', '#00000000'], ['lights', { x: 18, y: 18 }],
      ['vibrancy', null], ['background', '#1a1a1c'], ['lights', null],
    ]);
    calls.length = 0;
    applyGlass(win, 'linux', true);
    applyGlass(null, 'darwin', true);
    applyGlass({ ...win, isDestroyed: () => true }, 'darwin', true);
    expect(calls).toEqual([]);
  });

  it('is what the main window is made with', () => {
    const main = read('main/main.mts');
    const made = main.slice(main.indexOf('window = new BrowserWindow({'));
    const options = made.slice(0, made.indexOf('\n  });'));
    expect(main).toContain('const { additionalArguments, ...glass } = glassWindow(process.platform, alphaFeatures(config).glass);');
    expect(options).toContain('...glass,');
    expect(options).toMatch(/webPreferences: \{[^}]*additionalArguments,/);
    expect(options).not.toMatch(/backgroundColor:/);
  });

  // The preload marking a window able to go glass is run for real in
  // tests/the-flat-window-mark-does-not-drop-the-bridge.
});

describe('the page', () => {
  it('goes glass only when the switch is on and the window can, never on a phone', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).toContain("const glassOn = !!snap?.alpha?.glass && !onPhone();");
    expect(app).toContain("if (glassOn && 'glassAble' in root.dataset) root.dataset.glass = '';");
    expect(app).toContain('else delete root.dataset.glass;');
  });

  it('keeps the page root clear, so the window has no colour of its own to repaint', () => {
    expect(rule(`html${GLASS}, html${GLASS} body`)).toMatch(/background: transparent !important/);
    // Nothing else may put a glass tint back on the root.
    expect(nav).not.toMatch(/\[data-glass\][^{]*body \{[^}]*color-mix/);
  });

  it('tints Dark lightly with its own ground, on the app, and outlines the card', () => {
    expect(rule(`${DARK} .app.workspace-layout`)).toMatch(/background: color-mix\(in srgb, var\(--bg\) 25%, transparent\)/);
    const card = rule(`${DARK} .workspace-layout::before`);
    expect(card).toMatch(/background: linear-gradient\(var\(--skin-pane\), var\(--skin-pane\)\), var\(--skin-image\) center \/ cover no-repeat fixed var\(--bg\)/);
    expect(card).toMatch(/box-shadow: 0 0 0 1\.5px color-mix\(in srgb, var\(--text\) 16%, transparent\)/);
  });

  it('tints Light lightly with its sky\'s frame, on the app, with the card flat and no shadow', () => {
    expect(rule(`${LIGHT} .app.workspace-layout`)).toMatch(/background: color-mix\(in srgb, var\(--sky-frame, var\(--bg\)\) 20%, transparent\) !important/);
    const card = rule(':root[data-glass][data-theme="light"] .workspace-layout::before');
    expect(card).toMatch(/box-shadow: inset 0 0 0 1px color-mix\(in srgb, var\(--text\) 8%, transparent\)/);
    expect(card).not.toMatch(/shadow-card/);
  });

  it('sets the card 20px in from the right and the foot, with 14px corners, in both looks', () => {
    const card = rule(`${GLASS} .workspace-layout::before`);
    expect(card).toMatch(/right: 20px/);
    expect(card).toMatch(/bottom: 20px/);
    expect(card).toMatch(/border-radius: 14px/);
    expect(rule(`${GLASS} .app.workspace-layout`)).toMatch(/padding-right: 20px; padding-bottom: 20px/);
    expect(rule(`${GLASS} .home-sky`)).toMatch(/border-radius: 14px/);
    expect(rule(`${GLASS} .workspace-navigation`)).toMatch(/top: 60px; bottom: 20px/);
  });

  it('makes the top band twice the traffic lights\' centre, so they sit in its middle', () => {
    const { y } = glassWindow('darwin', true).trafficLightPosition!;
    const band = 2 * (y + 7);
    expect(band).toBe(50);
    expect(rule(`${GLASS} .app.workspace-layout`)).toMatch(new RegExp(`padding-top: ${band}px;`));
    expect(rule(`${GLASS} .workspace-layout::before`)).toMatch(new RegExp(`top: ${band}px;`));
    expect(rule(`${GLASS} .glass-band`)).toMatch(new RegExp(`top: 0; left: 0; right: 0; height: ${band}px`));
  });

  it('drags the window from the band, with no strip drawn over its buttons', () => {
    // `::after` comes last in the page, so its drag rectangle would beat every
    // no-drag button under it. Under glass it is not drawn; the band, which
    // comes before the header in the page, is the drag strip instead.
    expect(rule(`${GLASS} .workspace-layout::after`)).toMatch(/content: none/);
    const band = rule(`${GLASS} .glass-band`);
    expect(band).toMatch(/-webkit-app-region: drag/);
    // It lies over the arrows, so it must not take their clicks.
    expect(band).toMatch(/pointer-events: none/);
    const buttons = rule('.glass-band button');
    expect(buttons).toMatch(/-webkit-app-region: no-drag/);
    expect(buttons).toMatch(/pointer-events: auto/);
    const app = read('renderer/src/App.tsx');
    expect(app.indexOf('<GlassBand ')).toBeGreaterThan(-1);
    expect(app.indexOf('<GlassBand ')).toBeLessThan(app.indexOf('<header className="topbar">'));
  });

  it('puts back and forward, then Home and Inbox, level with the lights', () => {
    const { x, y } = glassWindow('darwin', true).trafficLightPosition!;
    const arrows = rule(`${GLASS} .topbar > .back-forward`);
    expect(arrows).toMatch(/position: fixed/);
    // The buttons are 26px tall, so their top is 13px above the lights' centre.
    expect(arrows).toMatch(new RegExp(`top: ${y + 7 - 13}px`));
    expect(arrows).toMatch(new RegExp(`left: ${x + 60 + 16}px`));
    const band = rule(`${GLASS} .glass-band`);
    // Its 26px buttons centred on the lights in a 50px band.
    expect(band).toMatch(new RegExp(`padding: ${y + 7 - 13}px 20px 0 ${x + 60 + 16 + 54 + 12}px`));
    expect(rule(`${GLASS} .app:not(.back-forward-on) .glass-band`)).toMatch(new RegExp(`padding-left: ${x + 60 + 16}px`));
    expect(rule('.glass-band')).toMatch(/display: none/);
  });

  it('has one New thread: the band\'s, with the card header\'s put away', () => {
    expect(rule(`${GLASS} .workspace-layout > .topbar .th-new[data-hint="new-task"]`)).toMatch(/display: none/);
    const band = read('renderer/src/components/GlassBand.tsx');
    expect(band).toMatch(/>New thread</);
    expect(band).toMatch(/chord\('⌘K'\)/);
    expect(band).not.toMatch(/In progress/);
  });
});
