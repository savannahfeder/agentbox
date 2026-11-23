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
  // Files lists a file under its first name; a chat that gets a later version under
  // that name holds two of it and opens the first.
  const onDisk = f.opened.split(/[\\/]/).pop() ?? '';
  const name = [f.name, ...(f.versionNames ?? [])].sort((a, b) => b.length - a.length)
    .find((n) => onDisk === n || onDisk.endsWith(`-${n}`)) ?? f.name;
  return { name, srcPath: f.opened, image: f.kind === 'image' };
}
