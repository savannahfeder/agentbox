// The window's own minimise, maximise and close buttons.
//
// The Mac window is `hiddenInset`: no title bar, and the traffic lights drawn
// over the page's top-left corner. On Windows the same style hid the whole
// frame and drew no buttons at all, so the window could not be closed, sized
// or minimised with the mouse. Windows gets Electron's overlay instead: the
// three system buttons, drawn over the page's top-right corner in the 40px
// band the layout keeps above the pane (renderer/src/workspace-navigation.css).
// Linux keeps what it has: it is run on tiling desktops that draw no buttons.

// The band above the pane, as tall as the Mac keeps for its lights.
export const BUTTONS_HEIGHT = 40;

// See-through, so the page shows under the buttons whatever its ground: the
// first run is white, the app off-white, and each look and sky its own. Only
// the ink follows the theme (styles.css --text).
const CLEAR = 'rgba(0, 0, 0, 0)';
const DARK = { color: CLEAR, symbolColor: '#f0f1f3' };
const LIGHT = { color: CLEAR, symbolColor: '#12182a' };

export type TitleBarOverlay = { color: string; symbolColor: string; height: number };

export type WindowFrame =
  | { titleBarStyle: 'hiddenInset' }
  | { titleBarStyle: 'hidden'; titleBarOverlay: TitleBarOverlay };

/** The overlay's colours for a page that is dark or light. */
export function windowButtons(dark: boolean): TitleBarOverlay {
  return { ...(dark ? DARK : LIGHT), height: BUTTONS_HEIGHT };
}

/** The title bar a new window is made with. The page starts dark. */
export function windowFrame(platform: NodeJS.Platform, dark = true): WindowFrame {
  if (platform !== 'win32') return { titleBarStyle: 'hiddenInset' };
  return { titleBarStyle: 'hidden', titleBarOverlay: windowButtons(dark) };
}

export interface ButtonedWindow {
  isDestroyed(): boolean;
  setTitleBarOverlay(options: TitleBarOverlay): void;
}

/** The buttons redrawn for the page's theme, when it changes. Windows only. */
export function tintWindowButtons(win: ButtonedWindow | null, platform: NodeJS.Platform, dark: unknown): void {
  if (platform !== 'win32' || !win || win.isDestroyed()) return;
  win.setTitleBarOverlay(windowButtons(dark !== false));
}
