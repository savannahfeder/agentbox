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
// The second build, photographed from inside a demo copy over the designs'
// wallpaper: Dark was see-through but greyer than its design at a 25% tint,
// and Light was not see-through at all, because the light sky paints its
// frame colour on body with a stronger rule, and because macOS draws the
// glass in the Mac's own appearance, so Light on a dark Mac got dark glass.
// Measured against the designs: Dark matches at 10%, Light at no tint.
//
// The third build, on the owner's Mac: every click left old pixels behind
// on the glass (the Settings sidebar, earlier labels, doubled counts) and the
// tint built up until it went dark. Reproduced in a demo copy photographed
// from inside: a window switched to glass while running keeps stale pixels,
// and so does one that is merely given its blur while running; a window
// created with the blur stays clean under the same clicks, Settings, sidebar
// and window resizes, pixel for pixel against a clean repaint, in both looks.
// So every Mac window is made with the blur, solid until the switch is on.
// Measured with Glass off, the blur underneath cost nothing: window drawing
// 39-46% against 41% without it, the app's GPU 12-13% against 12-14%.
//
// The fourth build, on the owner's Mac over white and black pages and a
// colourful one: "no evidence of a semi transparent background". Measured by
// photographing a demo copy over white, then black: the frame moved 41 of 255
// levels, a sixth of the desktop let through, greyed. The reference app lets
// about a third through and keeps its colour. On macOS 26 and later the Mac's
// own Liquid Glass under a transparent window moves 80 levels and keeps the
// desktop's colour (a red-to-blue swing of 153 against 41); with a 30% Dark
// tint the sidebar's labels stay readable over a bright wallpaper. Switching it
// on and off in a running window left nothing behind, in both looks, and with
// the switch off the window is as solid as before. Before macOS 26 the older
// blur stays, as 'popover', which measured a third.
//
// Covered: the switch is off unless turned on, and flips the window live; a
// Mac window can go glass and Linux and Windows never can; the page goes glass
// only when both are true; the root stays clear and the tint lives on the app;
// no drag strip lies over the band's buttons; each look draws its frame.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { GLASS_ARG, applyGlass, glassTone, glassWindow, loadWindowGlass } from '../main/window-glass.mts';
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
    expect(read('main/main.mts')).toMatch(/glass: \(on\) => applyGlass\(window, process\.platform, on, liquidGlass\)/);
  });
});

describe('the window', () => {
  it('starts a Mac window with Liquid Glass transparent, glass when the switch is on and solid when off', () => {
    const on = glassWindow('darwin', true, true);
    expect(on).toEqual({ transparent: true, backgroundColor: '#00000000', trafficLightPosition: { x: 18, y: 18 }, additionalArguments: [GLASS_ARG] });
    // The lights are 14pt across: this centres them 25pt in and 25pt down.
    expect(glassWindow('darwin', false, true)).toEqual({ transparent: true, backgroundColor: '#1a1a1c', additionalArguments: [GLASS_ARG] });
  });

  it('starts a Mac without Liquid Glass with the older blur that lets a third through, already under it when off', () => {
    const on = glassWindow('darwin', true, false);
    expect(on).toMatchObject({ vibrancy: 'popover', visualEffectState: 'active', backgroundColor: '#00000000', trafficLightPosition: { x: 18, y: 18 } });
    expect(on.transparent).toBeUndefined();
    expect(glassWindow('darwin', false, false)).toEqual({ visualEffectState: 'active', vibrancy: 'popover', backgroundColor: '#1a1a1c', additionalArguments: [GLASS_ARG] });
  });

  it('keeps the opaque window on Linux and Windows, switch or not', () => {
    for (const platform of ['linux', 'win32'] as const) {
      for (const on of [true, false]) for (const liquid of [true, false]) expect(glassWindow(platform, on, liquid)).toEqual({ backgroundColor: '#1a1a1c', additionalArguments: [] });
    }
  });

  it('turns a running Mac window glass and back, showing or hiding the Liquid Glass, and touches nothing elsewhere', () => {
    const calls: unknown[][] = [];
    const handle = Buffer.alloc(8);
    const win = {
      isDestroyed: () => false,
      setVibrancy: (v: unknown) => calls.push(['vibrancy', v]),
      setBackgroundColor: (c: unknown) => calls.push(['background', c]),
      setWindowButtonPosition: (p: unknown) => calls.push(['lights', p]),
      getNativeWindowHandle: () => handle,
    };
    const liquid = { set: (h: Buffer, on: boolean) => calls.push(['liquid', h === handle, on]) };
    applyGlass(win, 'darwin', true, liquid);
    applyGlass(win, 'darwin', false, liquid);
    expect(calls).toEqual([
      ['background', '#00000000'], ['lights', { x: 18, y: 18 }], ['liquid', true, true],
      ['background', '#1a1a1c'], ['lights', null], ['liquid', true, false],
    ]);
    calls.length = 0;
    applyGlass(win, 'darwin', true);
    expect(calls).toEqual([['background', '#00000000'], ['lights', { x: 18, y: 18 }]]);
    calls.length = 0;
    applyGlass(win, 'linux', true, liquid);
    applyGlass(null, 'darwin', true, liquid);
    applyGlass({ ...win, isDestroyed: () => true }, 'darwin', true, liquid);
    expect(calls).toEqual([]);
  });

  it('loads Liquid Glass only on a Mac that has it, and otherwise falls back', () => {
    const native = { available: () => true, set: () => true };
    expect(loadWindowGlass({ mac: true, load: () => native })).toBe(native);
    expect(loadWindowGlass({ mac: false, load: () => native })).toBeNull();
    expect(loadWindowGlass({ mac: true, load: () => ({ ...native, available: () => false }) })).toBeNull();
    expect(loadWindowGlass({ mac: true, load: () => { throw new Error('not built'); } })).toBeNull();
    // Its own native file: the tray's glass is pinned to its approved look.
    expect(read('main/native/window-glass/window-glass.mm')).toContain('NSGlassEffectView');
    expect(read('scripts/build-liquid-glass.mjs')).toContain("build('window-glass'");
  });

  it('sets the glass to the look\'s own appearance, and back to the Mac\'s', () => {
    expect(glassTone('light')).toBe('light');
    expect(glassTone('dark')).toBe('dark');
    for (const other of ['system', 'match', '', null, undefined, 3]) expect(glassTone(other)).toBe('system');
    const main = read('main/main.mts');
    expect(main).toContain("ipcMain.handle('zero:glass-tone', (_e, payload) => { nativeTheme.themeSource = glassTone(payload?.tone); });");
    expect(read('preload.cjs')).toContain("glassTone: (payload) => ipcRenderer.invoke('zero:glass-tone', payload),");
    const app = read('renderer/src/App.tsx');
    // An explicit Light or Dark sets it; Match system and glass off give it back.
    expect(app).toContain("window.zero?.glassTone?.({ tone: glassOn && 'glassAble' in document.documentElement.dataset && theme !== 'match' ? theme : 'system' });");
  });

  it('never gives or takes a running window\'s blur, anywhere in the app', () => {
    const files = fs.readdirSync(path.join(import.meta.dirname, '..', 'main'), { recursive: true, encoding: 'utf8' }).filter((n) => /\.m?[jt]s$/.test(n));
    expect(files.length).toBeGreaterThan(50);
    for (const f of files) expect(read(`main/${f}`), f).not.toMatch(/\bsetVibrancy\(/);
  });

  it('is what the main window is made with', () => {
    const main = read('main/main.mts');
    const made = main.slice(main.indexOf('window = new BrowserWindow({'));
    const options = made.slice(0, made.indexOf('\n  });'));
    expect(main).toContain('const { additionalArguments, ...glass } = glassWindow(process.platform, alphaFeatures(config).glass, !!liquidGlass);');
    // Liquid Glass is a view under the page, put in once the window exists.
    expect(made).toContain('if (alphaFeatures(config).glass) applyGlass(window, process.platform, true, liquidGlass);');
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
    expect(rule(`html${GLASS}, html${GLASS} body, html${GLASS}[data-sky-frame] body`)).toMatch(/background: transparent !important/);
    // Nothing else may put a glass tint back on the root.
    expect(nav).not.toMatch(/\[data-glass\][^{]*body \{[^}]*color-mix/);
  });

  it('tints Dark with its own ground, on the app, and outlines the card', () => {
    expect(rule(`${DARK} .app.workspace-layout`)).toMatch(/background: color-mix\(in srgb, var\(--bg\) 30%, transparent\)/);
    const card = rule(`${DARK} .workspace-layout::before`);
    expect(card).toMatch(/background: linear-gradient\(var\(--skin-pane\), var\(--skin-pane\)\), var\(--skin-image\) center \/ cover no-repeat fixed var\(--bg\)/);
    expect(card).toMatch(/box-shadow: 0 0 0 1\.5px color-mix\(in srgb, var\(--text\) 16%, transparent\)/);
  });

  it('leaves Light untinted, so the light glass alone shows, with the card flat and no shadow', () => {
    expect(rule(`${LIGHT} .app.workspace-layout`)).toMatch(/background: transparent !important/);
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
    const { y } = glassWindow('darwin', true, true).trafficLightPosition!;
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
    const { x, y } = glassWindow('darwin', true, true).trafficLightPosition!;
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

  it('has one Inbox: the band\'s tab, with the arrows\' icon and Home\'s own buttons put away', () => {
    // The approved band is lights, arrows, Home and Inbox; Home's greeting had
    // no place buttons under it.
    expect(rule(`${GLASS} .back-forward .back-forward-inbox`)).toMatch(/display: none/);
    expect(rule(`${GLASS} .hm-doors`)).toMatch(/display: none/);
  });

  it('folds the Inbox card\'s heading row away, since the band\'s tab already says it', () => {
    expect(read('renderer/src/components/GlassBand.tsx')).toMatch(/data-here=\{homeHere \? 'home' : inboxHere \? 'inbox' : undefined\}/);
    // The header row folds away, its Cloud and filter buttons stay on the
    // tabs row's right end, and the tabs sit 27px into the card, as designed.
    const INBOX = `${GLASS} .app:has(> .glass-band[data-here="inbox"])`;
    expect(rule(`${INBOX} > .topbar`)).toMatch(/height: 0; min-height: 0; flex-basis: 0; padding: 0; border-bottom: 0/);
    expect(rule(`${INBOX} > .topbar .workspace-title`)).toMatch(/display: none/);
    expect(rule(`${INBOX} > .topbar .topbar-right`)).toMatch(/position: absolute; top: 26px; right: 36px/);
    expect(rule(`${INBOX} .list-pane > .th-bar`)).toMatch(/padding-top: 27px/);
  });

  it('has one New thread: the band\'s, with the card header\'s put away', () => {
    expect(rule(`${GLASS} .workspace-layout > .topbar .th-new[data-hint="new-task"]`)).toMatch(/display: none/);
    const band = read('renderer/src/components/GlassBand.tsx');
    expect(band).toMatch(/>New thread</);
    expect(band).toMatch(/chord\('⌘K'\)/);
    expect(band).not.toMatch(/In progress/);
  });
});
