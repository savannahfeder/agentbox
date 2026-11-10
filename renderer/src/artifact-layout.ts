import { viewKind } from '../../shared/artifact-marks.mts';
import { isWebsiteAddress } from '../../shared/websites.mts';
import { opensInPane } from './doc-pane';

/** Keep a readable conversation beside a useful preview, measured in card pixels. */
export type ArtifactMode = 'beside' | 'focus';
export function artifactPlacement(mode: ArtifactMode, width: number): ArtifactMode {
  return mode === 'beside' && width < 1000 ? 'focus' : mode;
}
/** The full-screen file view, with versions, notes and Approve, reads this file. A website, a local app and a code change keep the pane's own full screen. */
export function fullScreenTakes(src: string | null | undefined): boolean {
  return !!src && !!viewKind(src) && !isWebsiteAddress(src) && !isLocalPreview(src);
}
// Something to look at opens full screen; something to read and talk over opens beside the chat.
const LOOKED_AT = new Set(['image', 'film', 'pdf', 'page', 'deck']);

/** Where a file pressed in a thread opens first. Null: its older way. */
export function whereAFileOpens(src: string | null | undefined): 'beside' | 'full' | null {
  if (!fullScreenTakes(src)) return null;
  return LOOKED_AT.has(viewKind(src) as string) || !opensInPane(src) ? 'full' : 'beside';
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
