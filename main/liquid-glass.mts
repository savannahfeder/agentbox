// The Mac's own Liquid Glass for a window, or null where there is none: not a
// Mac, a macOS before 26, or a build that could not compile main/native
// (scripts/build-liquid-glass.mjs). Null means the page draws its own glass.
import { createRequire } from 'node:module';

export interface GlassWindow { getNativeWindowHandle(): Buffer }
export interface GlassOptions { radius?: number; tone?: string; style?: string }
export interface NativeLiquidGlass {
  available(): boolean;
  set(handle: Buffer, rect: unknown, options: GlassOptions): unknown;
  clear(handle: Buffer): unknown;
  tone(handle: Buffer): unknown;
  luma?(handle: Buffer): number | null;
}
export interface LiquidGlass {
  set(win: GlassWindow, rect: unknown, options?: GlassOptions): unknown;
  clear(win: GlassWindow): unknown;
  tone(win: GlassWindow): unknown;
  luma(win: GlassWindow): number | null;
}

export function loadLiquidGlass({ mac = process.platform === 'darwin', load = createRequire(import.meta.url) as (id: string) => unknown }: { mac?: boolean; load?: (id: string) => unknown } = {}): LiquidGlass | null {
  if (!mac) return null;
  let native: NativeLiquidGlass;
  try {
    native = load('./native/liquid-glass/build/liquid-glass.node') as NativeLiquidGlass;
    if (!native.available()) return null;
  } catch {
    return null;
  }
  const handle = (win: GlassWindow) => win.getNativeWindowHandle();
  return {
    // tone: 'light' or 'dark' holds the glass that way; leave it out and the
    // glass decides from what is behind it. style: 'clear' for the Mac's clear
    // glass, which lets a light page through; otherwise the regular glass.
    set: (win: GlassWindow, rect: unknown, { radius, tone, style }: GlassOptions = {}) => native.set(handle(win), rect, {
      radius, ...(tone ? { tone } : {}), ...(style ? { style } : {}),
    }),
    clear: (win: GlassWindow) => native.clear(handle(win)),
    tone: (win: GlassWindow) => native.tone(handle(win)),
    // How bright the screen behind the glass is, 0 to 1, or null.
    luma: (win: GlassWindow) => (native.luma ? native.luma(handle(win)) : null),
  };
}
