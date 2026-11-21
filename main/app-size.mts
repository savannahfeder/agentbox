// How big the app draws, from the screen its window is on.
//
// Chromium keeps one zoom per page whatever screen it is on, so a size that
// suits a 34" screen also lands on the laptop. Here each screen has its own:
// its automatic size until ⌘+ or ⌘- picks another there, kept for that screen
// alone, so a step taken on the big screen never moves the laptop's text.
//
// The steps read the screen's long edge in points, like the corner tag's
// (shared/corner-tag.mts). Every laptop is under 2400, so a laptop draws as it
// always has. Only Electron's types are imported, so a test can run all of it
// against made-up screens.

import type { BrowserWindow, Screen, WebContents } from 'electron';

export const SCREEN_STEPS: { from: number; factor: number }[] = [
  { from: 0, factor: 1 },
  { from: 2400, factor: 1.25 },
  { from: 3000, factor: 1.5 },
];

/** The window's size on a laptop, which a bigger screen scales up. */
export const BASE_WINDOW = { width: 1440, height: 900 };

// Chromium's zoom factor is 1.2 to the power of the level, and the chords
// have always climbed it half a level at a time.
const ZOOM_BASE = 1.2;
const LEVELS = { min: -6, max: 6, step: 0.5 };
const SETTLE_MS = 250;
const SAME = 1e-6;

const positive = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

function sizeOf(display: unknown): { width: number; height: number } | null {
  const size = (display as { size?: { width?: unknown; height?: unknown } } | null | undefined)?.size;
  const width = positive(size?.width);
  const height = positive(size?.height);
  return width && height ? { width, height } : null;
}

/** The size a screen gets before anyone picks one, as a zoom factor. */
export function autoFactorFor(display: unknown): number {
  const size = sizeOf(display);
  const long = size ? Math.max(size.width, size.height) : 0;
  let factor = 1;
  for (const step of SCREEN_STEPS) if (long >= step.from) factor = step.factor;
  return factor;
}

const levelOf = (factor: number) => Math.log(factor) / Math.log(ZOOM_BASE);

export function autoLevelFor(display: unknown): number {
  return levelOf(autoFactorFor(display));
}

/** What a pick is kept under: the screen's size in points, so one monitor model is one key. */
export function screenKey(display: unknown): string | null {
  const size = sizeOf(display);
  return size ? `${Math.round(size.width)}x${Math.round(size.height)}` : null;
}

const isLevel = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= LEVELS.min && v <= LEVELS.max;

/** The saved picks, with anything that is not a screen and a level dropped. */
export function chosenSizes(saved: unknown): Record<string, number> {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
  const picks: Record<string, number> = {};
  for (const [key, level] of Object.entries(saved)) if (/^\d+x\d+$/.test(key) && isLevel(level)) picks[key] = level;
  return picks;
}

/** The zoom level the app draws at on this screen: the pick for it, or its automatic size. */
export function levelOn(display: unknown, chosen?: unknown): number {
  const key = screenKey(display);
  const picked = key ? chosenSizes(chosen)[key] : undefined;
  return picked ?? autoLevelFor(display);
}

/**
 * One chord's step, onto the next half level in that direction: plus or minus
 * a half from a level on that ladder, and the rung either side from the 150%
 * that sits between two.
 */
export function stepFrom(level: number, delta: number): number {
  if (!delta) return level;
  const halves = level / LEVELS.step;
  const next = delta > 0 ? (Math.floor(halves + SAME) + 1) * LEVELS.step : (Math.ceil(halves - SAME) - 1) * LEVELS.step;
  return Math.max(LEVELS.min, Math.min(LEVELS.max, next));
}

/** How big the window opens on a screen, so it holds what it holds on a laptop. */
export function openingSize(display: unknown, chosen?: unknown, base: { width: number; height: number } = BASE_WINDOW): { width: number; height: number } {
  const factor = ZOOM_BASE ** levelOn(display, chosen);
  if (factor <= 1 + SAME) return { ...base };
  const room = (display as { workArea?: { width?: unknown; height?: unknown } } | null | undefined)?.workArea;
  const fit = (want: number, space: unknown) => Math.round(Math.min(want, positive(space) ?? want));
  return { width: fit(base.width * factor, room?.width), height: fit(base.height * factor, room?.height) };
}

export interface AppSize {
  contents: WebContents;
  /** ⌘+ (0.5), ⌘- (-0.5) or ⌘0 (0) on this window; returns the level it now draws at. */
  step(delta: number): number;
}

/**
 * Keep `window` at the size for the screen it is on: when it loads a page
 * (Chromium hands back whatever level it last stored for the page), when it
 * is moved, and when a screen is plugged in, unplugged or changed.
 */
export function keepTheAppSizedForItsScreen({ window, screen, chosen, save, announce = () => {}, settleMs = SETTLE_MS }: {
  window: Pick<BrowserWindow, 'isDestroyed' | 'getBounds' | 'on' | 'webContents'>;
  screen: Pick<Screen, 'getDisplayMatching' | 'on' | 'removeListener'>;
  chosen: unknown;
  save: (picks: Record<string, number>) => unknown;
  announce?: (level: number) => unknown;
  settleMs?: number;
}): AppSize {
  let picks = chosenSizes(chosen);
  const contents = window.webContents;
  const live = () => !window.isDestroyed() && !contents.isDestroyed();
  const here = (): unknown => { try { return screen.getDisplayMatching(window.getBounds()); } catch { return null; } };

  const apply = (say: boolean) => {
    if (!live()) return;
    const level = levelOn(here(), picks);
    if (Math.abs(contents.getZoomLevel() - level) < SAME) return;
    contents.setZoomLevel(level);
    if (say) announce(level);
  };

  // `move` arrives all through a drag on Windows and Linux; the size changes
  // once, after the window stops. `moved` is the end of a drag, where there is one.
  let settling: ReturnType<typeof setTimeout> | null = null;
  const stopSettling = () => { if (settling) clearTimeout(settling); settling = null; };
  const moved = () => { stopSettling(); apply(true); };
  const moving = () => { stopSettling(); settling = setTimeout(moved, settleMs); };
  const screensChanged = () => apply(true);

  contents.on('did-navigate', () => apply(false));
  window.on('move', moving);
  window.on('moved', moved);
  screen.on('display-metrics-changed', screensChanged);
  screen.on('display-added', screensChanged);
  screen.on('display-removed', screensChanged);
  window.on('closed', () => {
    stopSettling();
    screen.removeListener('display-metrics-changed', screensChanged);
    screen.removeListener('display-added', screensChanged);
    screen.removeListener('display-removed', screensChanged);
  });
  apply(false);

  return {
    contents,
    step(delta) {
      const display = here();
      const key = screenKey(display);
      const auto = autoLevelFor(display);
      const next = delta === 0 ? auto : stepFrom(levelOn(display, picks), delta);
      if (key) {
        const rest = { ...picks };
        delete rest[key];
        picks = Math.abs(next - auto) < SAME ? rest : { ...rest, [key]: next };
        // A pick that cannot be written still changes the size; it is only not kept.
        try { save({ ...picks }); } catch { /* see above */ }
      }
      if (live()) contents.setZoomLevel(next);
      return next;
    },
  };
}
