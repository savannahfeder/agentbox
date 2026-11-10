// The main window's ground. On a Mac the system blurs the desktop behind the
// window and the page lets it through where it paints the ground with
// see-through colour; the preload marks the page when this argument is there.
// Elsewhere the window stays opaque, so a see-through page would show nothing.
export const GLASS_ARG = '--agentbox-glass';

export type GlassOptions = {
  vibrancy?: 'under-window';
  visualEffectState?: 'active';
  trafficLightPosition?: { x: number; y: number };
  backgroundColor: string;
  additionalArguments: string[];
};

export function glassWindow(platform: NodeJS.Platform): GlassOptions {
  if (platform !== 'darwin') return { backgroundColor: '#1a1a1c', additionalArguments: [] };
  return {
    vibrancy: 'under-window',
    // Keeps the blur when the window is not focused, as the reference does.
    visualEffectState: 'active',
    // The reference's lights, centred 25pt in and 25pt down; this is the top-left of 14pt buttons.
    trafficLightPosition: { x: 18, y: 18 },
    backgroundColor: '#00000000',
    additionalArguments: [GLASS_ARG],
  };
}
