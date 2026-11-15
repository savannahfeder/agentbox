// The main window's ground, behind the Glass switch in Settings, Alpha
// features. On a Mac with it on, the desktop shows through the ground, blurred,
// where the page paints it with see-through colour. Every Mac window carries
// GLASS_ARG, so its page knows it may go glass; the switch itself reaches the
// page in the snapshot. Elsewhere the window stays opaque, because a
// see-through page would show nothing.
//
// From macOS 26 the glass is the Mac's own Liquid Glass
// (main/native/window-glass), under a transparent window. Before that it is
// the older blur, which lets far less of the desktop through.
import { createRequire } from 'node:module';

export const GLASS_ARG = '--agentbox-glass';

const OPAQUE = '#1a1a1c';
const CLEAR = '#00000000';
// Of the older blurs, the one that lets about a third of the desktop through,
// as the reference app does. 'sidebar' let a sixth through and read as solid.
const MATERIAL = 'popover' as const;
// The reference's lights, centred 25pt in and 25pt down; this is the top-left of 14pt buttons.
const LIGHTS = { x: 18, y: 18 };

export type GlassOptions = {
  transparent?: boolean;
  vibrancy?: typeof MATERIAL;
  visualEffectState?: 'active';
  trafficLightPosition?: { x: number; y: number };
  backgroundColor: string;
  additionalArguments: string[];
};

export interface LiquidWindowGlass { set(handle: Buffer, on: boolean): unknown }

/** The Mac's Liquid Glass for the main window, or null: not a Mac, before macOS 26, or not built. */
export function loadWindowGlass({ mac = process.platform === 'darwin', load = createRequire(import.meta.url) as (id: string) => unknown }: { mac?: boolean; load?: (id: string) => unknown } = {}): LiquidWindowGlass | null {
  if (!mac) return null;
  try {
    const native = load('./native/window-glass/build/window-glass.node') as LiquidWindowGlass & { available(): boolean };
    return native.available() ? native : null;
  } catch {
    return null;
  }
}

export function glassWindow(platform: NodeJS.Platform, on: boolean, liquid: boolean): GlassOptions {
  if (platform !== 'darwin') return { backgroundColor: OPAQUE, additionalArguments: [] };
  // See-through from the start even with the switch off, under a solid
  // background: the older blur, given to a running window, left old pixels on
  // the glass at every repaint.
  const mac = liquid
    ? { transparent: true, additionalArguments: [GLASS_ARG] }
    : { vibrancy: MATERIAL, visualEffectState: 'active' as const, additionalArguments: [GLASS_ARG] };
  return on
    ? { ...mac, trafficLightPosition: LIGHTS, backgroundColor: CLEAR }
    : { ...mac, backgroundColor: OPAQUE };
}

export interface GlassableWindow {
  isDestroyed(): boolean;
  setBackgroundColor(color: string): void;
  setWindowButtonPosition(position: { x: number; y: number } | null): void;
  getNativeWindowHandle(): Buffer;
}

/**
 * The appearance macOS draws the glass in. It follows the Mac's own unless
 * told, so Light on a dark Mac got dark glass. An explicit Light or Dark sets
 * it; anything else gives it back to the Mac.
 */
export function glassTone(tone: unknown): 'light' | 'dark' | 'system' {
  return tone === 'light' || tone === 'dark' ? tone : 'system';
}

/** The window turned glass or back: when it opens, and when the switch flips while it runs. */
export function applyGlass(win: GlassableWindow | null, platform: NodeJS.Platform, on: boolean, liquid: LiquidWindowGlass | null = null): void {
  if (platform !== 'darwin' || !win || win.isDestroyed()) return;
  win.setBackgroundColor(on ? CLEAR : OPAQUE);
  win.setWindowButtonPosition(on ? LIGHTS : null);
  liquid?.set(win.getNativeWindowHandle(), on);
}
