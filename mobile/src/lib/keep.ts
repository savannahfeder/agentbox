// Saving a file from a thread onto the phone: a picture or a film to Photos,
// anything else through the share sheet as the file itself. A file's link is
// signed and soon stops working, so it is never what gets shared.
import type { Opening } from './files';

export interface Keepable { link: string; name: string; photos: boolean }

const PHOTOS = /\.(png|jpe?g|gif|webp|heic|heif|mp4|mov|m4v)$/i;

export function keptName(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '-').trim() || 'file';
}

/** What the phone can keep of `src`: nothing for a site, a folder, or a file it does not have. */
export function keepableOf(o: Opening, src: string): Keepable | null {
  if (o.kind === 'web' || o.kind === 'folder' || o.kind === 'refused') return null;
  const name = src.replace(/\/+$/, '').split('/').pop() || src;
  return { link: o.link, name, photos: PHOTOS.test(name) };
}

export const SAVE = 'Save to Photos';
export const SHARE = 'Share';
export const SHARE_FILE = 'Share or save to Files';
export const OPEN = 'Open in browser';
export const SHARE_LINK = 'Share or copy link';

/** The long press's choices, in the order they are offered. */
export function choicesFor(k: Keepable | null, link: string): string[] {
  if (!k) return link ? [OPEN, SHARE_LINK] : [];
  return k.photos ? [SAVE, SHARE, OPEN] : [SHARE_FILE, OPEN];
}

export interface KeepDeps {
  /** Puts the file in the phone's cache under `name` and gives its local address. */
  download(link: string, name: string): Promise<string>;
  /** Whether the app may add to Photos, asking the first time. */
  allowPhotos(): Promise<boolean>;
  toPhotos(uri: string): Promise<void>;
  share(uri: string): Promise<void>;
}

/** Keeps the file and gives the line to show, or null when the share sheet said it already. */
export async function keepFile(k: Keepable, how: 'photos' | 'share', deps: KeepDeps): Promise<string | null> {
  const name = keptName(k.name);
  if (how === 'photos' && !(await deps.allowPhotos())) return 'Photos is turned off for this app. Turn it on in Settings, then save again.';
  try {
    const uri = await deps.download(k.link, name);
    if (how === 'share') { await deps.share(uri); return null; }
    await deps.toPhotos(uri);
    return 'Saved to Photos.';
  } catch (e) {
    const why = e instanceof Error && e.message ? ` ${e.message}` : '';
    return `Could not ${how === 'photos' ? 'save' : 'share'} ${k.name}.${why}`;
  }
}
