// The main window's ground, behind the Glass switch in Settings, Alpha
// features. On a Mac with it on, the system blurs the desktop behind the
// window and the page lets it through where it paints the ground with
// see-through colour. Every Mac window carries GLASS_ARG, so its page knows it
// may go glass; the switch itself reaches the page in the snapshot. Elsewhere
// the window stays opaque, because a see-through page would show nothing.
export const GLASS_ARG = '--agentbox-glass';

const OPAQUE = '#1a1a1c';
// The Finder sidebar's glass. 'under-window' is the window's own ground and is
// close to opaque in dark mode, which read as no glass at all.
const MATERIAL = 'sidebar';
// The reference's lights, centred 25pt in and 25pt down; this is the top-left of 14pt buttons.
const LIGHTS = { x: 18, y: 18 };

export type GlassOptions = {
  vibrancy?: typeof MATERIAL;
  visualEffectState?: 'active';
  trafficLightPosition?: { x: number; y: number };
  backgroundColor: string;
  additionalArguments: string[];
};

export function glassWindow(platform: NodeJS.Platform, on: boolean): GlassOptions {
  if (platform !== 'darwin') return { backgroundColor: OPAQUE, additionalArguments: [] };
  // 'active' keeps the blur when the window is not focused, as the reference does.
  const mac = { visualEffectState: 'active' as const, additionalArguments: [GLASS_ARG] };
  return on
    ? { ...mac, vibrancy: MATERIAL, trafficLightPosition: LIGHTS, backgroundColor: '#00000000' }
    : { ...mac, backgroundColor: OPAQUE };
}

export interface GlassableWindow {
  isDestroyed(): boolean;
  setVibrancy(type: typeof MATERIAL | null): void;
  setBackgroundColor(color: string): void;
  setWindowButtonPosition(position: { x: number; y: number } | null): void;
}

/**
 * The appearance macOS draws the glass in. It follows the Mac's own unless
 * told, so Light on a dark Mac got dark glass. An explicit Light or Dark sets
 * it; anything else gives it back to the Mac.
 */
export function glassTone(tone: unknown): 'light' | 'dark' | 'system' {
  return tone === 'light' || tone === 'dark' ? tone : 'system';
}

/** Flipping the switch while the app runs: the same window, turned glass or back. */
export function applyGlass(win: GlassableWindow | null, platform: NodeJS.Platform, on: boolean): void {
  if (platform !== 'darwin' || !win || win.isDestroyed()) return;
  win.setVibrancy(on ? MATERIAL : null);
  win.setBackgroundColor(on ? '#00000000' : OPAQUE);
  win.setWindowButtonPosition(on ? LIGHTS : null);
}
