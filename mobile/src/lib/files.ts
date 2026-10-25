// WHAT A FILE A THREAD NAMES DOES ON THE PHONE APP: the phone site's rules
// (Focus.tsx `openHref`, cloud-bridge.ts `openArtifact`, `readDoc`,
// `folderPictures`), over the same list of her files and their links.

import { docKind } from '../../../renderer/src/doc-pane';
import { isMediaPath } from '../../../renderer/src/artifact-paths';
import { fileOf, findFile, findFolder, type Place } from '../../../renderer/src/cloud-files';
import { fileOnPhone, phonePage, type Links } from '../../../renderer/src/phone-links';
import { embeddedDocuments, isBookkeeping } from '../../../renderer/src/message-artifacts';
import { referencedFiles } from '../../../renderer/src/referenced-files';
import { threadWords, typedParts } from '../../../renderer/src/typed-message';

type Places = Map<string, Place>;

export type Opening =
  | { kind: 'web'; url: string }
  | { kind: 'picture' | 'doc' | 'page' | 'media'; src: string; link: string; name: string }
  | { kind: 'folder'; folder: string; pictures: string[] }
  /** A file the phone has and the app does not draw: the site opens its link, so does the app. */
  | { kind: 'elsewhere'; link: string }
  | { kind: 'refused'; error: string };

const WEB = /^(https?|mailto):/i;
const nameOf = (src: string) => src.replace(/\/+$/, '').split('/').pop() ?? src;

/** A folder a message names: every picture in it, as full paths on the phone. */
export function folderPictures(places: Places, product: string, src: string) {
  const place = places.get(product);
  const found = place && findFolder(place, src);
  if (!place || !found) return null;
  return { folder: found.folder, pictures: found.keys.map((k) => fileOf(place, k)), total: found.keys.length };
}

/** What a press on `src` opens. */
export function openingOf(places: Places, links: Links, product: string, src: string): Opening {
  if (WEB.test(src)) return { kind: 'web', url: src };
  if (/\/$/.test(src)) {
    const folder = folderPictures(places, product, src);
    return folder ? { kind: 'folder', folder: folder.folder, pictures: folder.pictures } : { kind: 'refused', error: 'This folder is on your computer.' };
  }
  const at = fileOnPhone(places, links, product, src);
  if (!at.ok) return { kind: 'refused', error: at.error };
  const kind = docKind(src);
  const shown = { src, link: at.link, name: nameOf(src) };
  if (kind === 'image') return { kind: 'picture', ...shown };
  if (kind === 'markdown') return { kind: 'doc', ...shown };
  if (kind === 'html') return { kind: 'page', ...shown };
  if (isMediaPath(src)) return { kind: 'media', ...shown };
  return { kind: 'elsewhere', link: at.link };
}

/** A picture's link: undefined while it is on its way, null when the phone will not have it. */
export function pictureLink(places: Places, links: Links, product: string, src: string): string | null | undefined {
  const at = fileOnPhone(places, links, product, src);
  return at.ok ? at.link : at.waiting ? undefined : null;
}

/** A picture's width and height as its computer listed them, or null. */
export function pictureShapeOf(places: Places, product: string, src: string): { w: number; h: number } | null {
  const e = findFile(places, product, src)?.entry;
  const ok = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
  return e && ok(e.w) && ok(e.h) ? { w: e.w, h: e.h } : null;
}

/** Can the phone play this film or sound. */
export const playable = (places: Places, links: Links, product: string, src: string) => fileOnPhone(places, links, product, src).ok;

/** A message you sent, as you typed it, without the lines the app wrote for its files. */
export const typedWords = (text: string) => typedParts(text).flatMap((p) => ('text' in p ? [threadWords(p.text)] : [])).join('\n\n');

/** The lines the app wrote into a message you sent, one for each file. */
export const sentEmbeds = (text: string) => typedParts(text).flatMap((p) => ('embed' in p ? [p.embed] : []));

type Said = { result?: string | null; note?: string | null; body?: string | null; answer?: string | null };

/** The files a thread draws as tiles under its messages: its designs, then the documents it names that are not ours (Focus.tsx `previewPaths`). */
export function threadFilePaths(item: Said, dir: string | null): string[] {
  const documents = referencedFiles(item.result, item.note, item.body, item.answer, { dir }).filter((path: string) => /\.(md|markdown)$/i.test(path) && !isBookkeeping(path));
  return [...new Set([...embeddedDocuments(item, dir), ...documents])];
}

/** A page made ready to draw, or why it cannot be. */
export async function pageOnPhone(places: Places, links: Links, product: string, src: string, read: (url: string) => Promise<string>): Promise<{ ok: true; html: string } | { ok: false; error: string }> {
  const at = fileOnPhone(places, links, product, src);
  if (!at.ok) return { ok: false, error: at.error };
  const found = at.sent ? null : at.found;
  if (!found) return { ok: false, error: 'This file is on your computer.' };
  try {
    return { ok: true, html: (await phonePage(found, at.link, links, read)).html };
  } catch (err) {
    return { ok: false, error: String((err as Error)?.message ?? err) };
  }
}

/** A document's words, or why they cannot be read (cloud-bridge.ts `readDoc`). */
export async function docOnPhone(places: Places, links: Links, product: string, src: string, read: (url: string) => Promise<string>): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const at = fileOnPhone(places, links, product, src);
  if (!at.ok) return { ok: false, error: findFile(places, product, src)?.entry.big ? 'This file is too big for your phone.' : at.error };
  try { return { ok: true, text: await read(at.link) }; } catch { return { ok: false, error: 'This file could not be read.' }; }
}
