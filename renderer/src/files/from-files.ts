// PURE. The files the reply box's "From Files" offers, found the way Files finds them.
import type { PlacedFile } from '../types';
import { filesShown } from './files-shown';

const MOST = 8;

export function filesToAttach(files: PlacedFile[], query: string): PlacedFile[] {
  return [...filesShown(files, { query })].sort((a, b) => b.at - a.at).slice(0, MOST);
}

/** The newest version on this computer; null while it has not come down. */
export function attachmentOf(f: PlacedFile): { name: string; srcPath: string; image: boolean } | null {
  if (!f.opened) return null;
  return { name: f.name, srcPath: f.opened, image: f.kind === 'image' };
}
