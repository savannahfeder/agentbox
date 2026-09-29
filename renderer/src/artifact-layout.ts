/** Keep a readable conversation beside a useful preview, measured in card pixels. */
export type ArtifactMode = 'beside' | 'focus';
export function artifactPlacement(mode: ArtifactMode, width: number): ArtifactMode {
  return mode === 'beside' && width < 1000 ? 'focus' : mode;
}
export function artifactFraction(fraction: number, width: number): number {
  return Math.max(560 / width, Math.min(1 - 400 / width, fraction));
}
export function isLocalPreview(src: string): boolean {
  try {
    const url = new URL(src);
    return ['http:', 'https:'].includes(url.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch { return false; }
}
