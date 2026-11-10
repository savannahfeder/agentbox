// The main window's ground. On a Mac the system blurs the desktop behind the
// window and the page lets it through where it paints the ground with
// see-through colour; the preload marks the page when this argument is there.
// Elsewhere the window stays opaque, so a see-through page would show nothing.
export const GLASS_ARG = '--agentbox-glass';

export type GlassOptions = {
  vibrancy?: 'under-window';
  visualEffectState?: 'active';
  backgroundColor: string;
  additionalArguments: string[];
};

export function glassWindow(platform: NodeJS.Platform): GlassOptions {
  if (platform !== 'darwin') return { backgroundColor: '#1a1a1c', additionalArguments: [] };
  // 'active' keeps the blur when the window is not focused, as the reference does.
  return { vibrancy: 'under-window', visualEffectState: 'active', backgroundColor: '#00000000', additionalArguments: [GLASS_ARG] };
}
