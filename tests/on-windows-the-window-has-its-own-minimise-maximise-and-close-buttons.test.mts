// On Windows the main window had no minimise, maximise or close button and no
// title bar to drag. It was made with `titleBarStyle: 'hiddenInset'`, the Mac's
// style, which on Windows hides the whole frame and draws no buttons unless
// `titleBarOverlay` is set. Measured from the source on 2026-11-14: the only
// title bar options in main/main.mts and main/hub-client.mts were that one
// line. Windows now gets the system's own three buttons drawn over the page's
// top-right corner, in the 40px band the layout keeps above the pane, with
// the ink of the page's light or dark. Their ground was first the band's
// opaque --bg, and on a fresh GitHub Windows machine (2026-11-20) that showed
// as a box: (36, 38, 42) beside the Dark look's (32, 25, 21), and (248, 248,
// 250) beside the first run's white. A see-through ground showed no box, and
// hovering still drew Close's red and a grey behind the others. The hub
// client's page cannot reach the buttons, so there they follow the system's
// light or dark. The Mac and Linux keep `hiddenInset` exactly.

import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { BUTTONS_HEIGHT, tintWindowButtons, windowButtons, windowFrame } from '../main/window-buttons.mts';
import { REQUEST_CHANNELS } from '../shared/bridge-map.mts';

const read = (f: string) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');

describe('the title bar a window is made with', () => {
  it('is the Mac\'s hiddenInset on a Mac and on Linux, and nothing else', () => {
    expect(windowFrame('darwin')).toEqual({ titleBarStyle: 'hiddenInset' });
    expect(windowFrame('darwin', false)).toEqual({ titleBarStyle: 'hiddenInset' });
    expect(windowFrame('linux')).toEqual({ titleBarStyle: 'hiddenInset' });
  });

  it('is hidden with the system buttons drawn over it on Windows', () => {
    const frame = windowFrame('win32');
    expect(frame).toEqual({ titleBarStyle: 'hidden', titleBarOverlay: windowButtons(true) });
    expect(windowFrame('win32', false)).toEqual({ titleBarStyle: 'hidden', titleBarOverlay: windowButtons(false) });
  });

  it('draws the buttons as tall as the band, on no ground of their own, in the band\'s ink', () => {
    const css = read('renderer/src/styles.css').replace(/\r\n/g, '\n');
    // The first :root block is light; the dark block follows it.
    const block = (open: string) => { const at = css.indexOf(open); expect(at, open).toBeGreaterThan(-1); return css.slice(at, css.indexOf('\n}', at)); };
    const token = (src: string, name: string) => new RegExp(`\\n\\s*${name}:\\s*(#[0-9a-f]{6});`, 'i').exec(src)?.[1];
    const light = block(':root {\n');
    const dark = block(':root[data-theme="dark"],\n');
    for (const [isDark, src] of [[true, dark], [false, light]] as const) {
      const buttons = windowButtons(isDark);
      expect(buttons.height).toBe(BUTTONS_HEIGHT);
      expect(buttons.symbolColor).toBe(token(src, '--text'));
      // Whatever the look, the page shows through: alpha 0.
      expect(buttons.color).toMatch(/^rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\)$/);
    }
    expect(windowButtons(true)).not.toEqual(windowButtons(false));
  });

  it('is the height of the band the layout keeps above the pane', () => {
    const css = read('renderer/src/workspace-navigation.css');
    expect(css).toMatch(new RegExp(`\\.workspace-layout::after \\{[^}]*height: ${BUTTONS_HEIGHT}px`));
  });
});

describe('the buttons follow the page\'s theme', () => {
  const fake = (destroyed = false) => {
    const calls: unknown[] = [];
    return { calls, isDestroyed: () => destroyed, setTitleBarOverlay: (o: unknown) => { calls.push(o); } };
  };

  it('redraws the glyphs on Windows', () => {
    const win = fake();
    tintWindowButtons(win, 'win32', false);
    tintWindowButtons(win, 'win32', true);
    expect(win.calls).toEqual([windowButtons(false), windowButtons(true)]);
  });

  it('takes anything but false as dark, the page\'s default', () => {
    const win = fake();
    tintWindowButtons(win, 'win32', undefined);
    expect(win.calls).toEqual([windowButtons(true)]);
  });

  it('touches nothing on a Mac or Linux, or on a closed window', () => {
    for (const platform of ['darwin', 'linux'] as const) {
      const win = fake();
      tintWindowButtons(win, platform, false);
      expect(win.calls).toEqual([]);
    }
    const closed = fake(true);
    tintWindowButtons(closed, 'win32', false);
    expect(closed.calls).toEqual([]);
    expect(() => tintWindowButtons(null, 'win32', false)).not.toThrow();
  });
});

describe('the windows the app makes', () => {
  it('take their title bar from windowFrame and name no style of their own', () => {
    for (const file of ['main/main.mts', 'main/hub-client.mts']) {
      const src = read(file);
      const made = src.slice(src.indexOf('window = new BrowserWindow({'));
      const options = made.slice(0, made.indexOf('webPreferences:'));
      expect(options, file).toMatch(/\.\.\.windowFrame\(process\.platform(, nativeTheme\.shouldUseDarkColors)?\),/);
      expect(options, file).not.toMatch(/titleBarStyle:/);
    }
  });

  it('gives the hub client\'s buttons the system\'s light or dark, on Windows only', () => {
    const src = read('main/hub-client.mts');
    expect(src).toContain('...windowFrame(process.platform, nativeTheme.shouldUseDarkColors),');
    expect(src).toContain("if (process.platform === 'win32') nativeTheme.on('updated', () => tintWindowButtons(window, process.platform, nativeTheme.shouldUseDarkColors));");
  });

  it('hands the page\'s theme to the buttons, from a Windows page only', () => {
    expect(REQUEST_CHANNELS.windowButtons).toBe('zero:window-buttons');
    expect(read('main/main.mts')).toContain("ipcMain.handle('zero:window-buttons', (_e, payload) => { tintWindowButtons(window, process.platform, payload?.dark); });");
    expect(read('main/serve.mts')).toContain("ipcMain.handle('zero:window-buttons', () => null);");
    expect(read('renderer/src/App.tsx')).toContain('useEffect(() => { if (WINDOWS) window.zero?.windowButtons?.({ dark: darkWindow }); }, [darkWindow]);');
  });
});

// The tests above read App.tsx as text, so they still pass when the WINDOWS it
// imports from this-keyboard.ts is gone.
describe('the page that tints them', () => {
  it.each([['Win32', true], ['MacIntel', false], ['Linux x86_64', false], ['iPhone', false]])('knows it is on Windows from a navigator that says %s', async (platform, windows) => {
    vi.resetModules();
    vi.stubGlobal('document', {});
    vi.stubGlobal('navigator', { platform, userAgent: '' });
    try {
      expect((await import('../renderer/src/this-keyboard.ts')).WINDOWS).toBe(windows);
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });

  it('is not on Windows when there is no window', async () => {
    expect((await import('../renderer/src/this-keyboard.ts')).WINDOWS).toBe(false);
  });
});

describe('the page keeps the corner clear', () => {
  function marks(platform: NodeJS.Platform, file = 'preload.cjs') {
    const preloadPath = path.join(import.meta.dirname, '..', file);
    const source = fs.readFileSync(preloadPath, 'utf8');
    const html = { dataset: {} as Record<string, string> };
    const sandbox = {
      console,
      process: { platform, env: {}, argv: [] },
      document: { readyState: 'loading', documentElement: html, addEventListener() {} },
      require: () => ({ contextBridge: { exposeInMainWorld() {} }, ipcRenderer: { on() {}, send() {}, invoke() {} }, webUtils: {} }),
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: preloadPath });
    return html.dataset;
  }

  it('marks a Windows window as having its buttons on the right, and no other', () => {
    expect(marks('win32')).toEqual({ window: 'flat', windowButtons: 'right' });
    expect(marks('linux')).toEqual({ window: 'flat' });
    expect(marks('darwin')).toEqual({});
  });

  it('marks the hub client\'s window the same on Windows, and leaves the Mac and Linux as they were', () => {
    expect(marks('win32', 'main/hub-client-preload.cjs')).toEqual({ window: 'flat', windowButtons: 'right' });
    expect(marks('linux', 'main/hub-client-preload.cjs')).toEqual({});
    expect(marks('darwin', 'main/hub-client-preload.cjs')).toEqual({});
  });

  it('keeps the 40px band above the pane on Windows, after the flat rules so it wins', () => {
    const css = read('renderer/src/workspace-navigation.css');
    const at = (sel: string) => css.indexOf(sel);
    const rules: [string, RegExp][] = [
      [':root[data-window-buttons="right"] .app.workspace-layout {', /padding-top:\s*40px/],
      [':root[data-window-buttons="right"] .workspace-layout::before {', /top:\s*40px/],
      [':root[data-window-buttons="right"] .workspace-navigation {', /top:\s*50px/],
      [':root[data-window-buttons="right"] .workspace-layout::after {', /height:\s*40px/],
    ];
    const lastFlat = at(':root[data-window="flat"] .workspace-layout::after {');
    expect(lastFlat).toBeGreaterThan(-1);
    for (const [sel, decl] of rules) {
      expect(at(sel), sel).toBeGreaterThan(lastFlat);
      expect(css.slice(at(sel), css.indexOf('}', at(sel))), sel).toMatch(decl);
    }
  });

  it('ends a full-window view\'s header short of the three buttons', () => {
    // Three 46px buttons, 138 in all.
    const views: [string, string, string][] = [
      ['renderer/src/components/artifact-view.css', '.av-top', 'padding-right'],
      ['renderer/src/styles.css', '.pv-top', 'right'],
      ['renderer/src/components/file-views.css', '.file-sheet-head', 'padding-right'],
      ['renderer/src/styles.css', '.zoom-readout', 'right'],
      ['renderer/src/components/tour-frame.css', '.tour-frame .tf-skip', 'right'],
      ['renderer/src/team/sign-in.css', '.si-skip-corner', 'right'],
    ];
    for (const [file, sel, prop] of views) {
      const css = read(file);
      const m = new RegExp(`:root\\[data-window-buttons="right"\\] ${sel.replace('.', '\\.')} \\{[^}]*${prop}:\\s*(\\d+)px`).exec(css);
      expect(m, `${sel} in ${file}`).not.toBeNull();
      expect(Number(m![1])).toBeGreaterThan(138);
    }
  });
});
