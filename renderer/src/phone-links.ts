// HER FILES' LINKS ON THE PHONE, for the phone site (cloud-bridge.ts) and the
// phone app alike: by name in the bucket, each signed for twelve hours and
// asked for again an hour before it runs out, so a film is not pulled from
// under her mid-play by a new link.

import { findFile, keyAt, pageForPhone, pageStyles, withStyles, type Place } from './cloud-files';
import { sentFileName, sentNamesIn } from './phone-sends-files';
import type { PhoneRows } from './phone-rows';

export const LINK_LIFE_MS = 12 * 3600_000;
export const LINK_RENEW_MS = 3600_000;
export type Links = Map<string, { url: string; until: number }>;

const stale = (links: Links, n: string, now: number) => !((links.get(n)?.until ?? 0) - now > LINK_RENEW_MS);

/** The objects whose links are missing or about to run out. */
export function objectsToSign(places: Map<string, Place>, commands: PhoneRows['commands'], links: Links, owner: string, now = Date.now()): string[] {
  const want: string[] = [];
  for (const place of places.values()) for (const e of place.files.values()) {
    if (e.n && stale(links, e.n, now)) want.push(`${owner}/${place.device}/${e.n}`);
  }
  // What she sent that her computer has not taken yet, drawn from where she put it.
  for (const c of commands) {
    if (c.taken_at) continue;
    for (const n of sentNamesIn(String(c.payload?.text ?? c.payload?.body ?? ''))) if (stale(links, n, now)) want.push(`${owner}/${c.device}/${n}`);
  }
  return [...new Set(want)];
}

/**
 * Signs `objects` 300 at a time into `links`. Stops when `stillAsked` says the
 * sign-in that asked has ended, so one person's links never land in another's.
 */
export async function renewLinks(sign: (paths: string[], seconds: number) => Promise<Map<string, string>>, objects: string[], links: Links, stillAsked: () => boolean = () => true) {
  for (let i = 0; i < objects.length; i += 300) {
    const got = await sign(objects.slice(i, i + 300), LINK_LIFE_MS / 1000);
    if (!stillAsked()) return;
    for (const [object, url] of got) links.set(object.slice(object.lastIndexOf('/') + 1), { url, until: Date.now() + LINK_LIFE_MS });
  }
}

export const linkOfEntry = (links: Links, n?: string) => (n ? links.get(n)?.url ?? null : null);

/** The link for a full path on the phone, or for a file she sent, or null. */
export function linkForFile(places: Map<string, Place>, links: Links, file: string): string | null {
  const sent = sentFileName(file);
  if (sent) return linkOfEntry(links, sent);
  const at = keyAt(places, file);
  return at ? linkOfEntry(links, at.place.files.get(at.key)?.n) : null;
}

export type FileOnPhone =
  | { ok: true; link: string; sent: true }
  | { ok: true; link: string; sent: false; found: NonNullable<ReturnType<typeof findFile>> }
  // `waiting`: it is coming, so a picture holds its place rather than saying it is missing.
  | { ok: false; error: string; waiting?: true };

/** A file a message names, as the phone can open it: its link, or why it cannot. */
export function fileOnPhone(places: Map<string, Place>, links: Links, product: string, src: string): FileOnPhone {
  const sent = sentFileName(src);
  if (sent) {
    const link = linkOfEntry(links, sent);
    return link ? { ok: true, link, sent: true } : { ok: false, error: 'This file is still on its way.', waiting: true };
  }
  const found = findFile(places, product, src);
  if (!found) return { ok: false, error: 'This file is on your computer.' };
  if (found.entry.big) return { ok: false, error: 'This file is too big for your phone. Open it on your computer.' };
  const link = linkOfEntry(links, found.entry.n);
  return link ? { ok: true, link, sent: false, found } : { ok: false, error: 'This file is on its way from your computer.', waiting: true };
}

/**
 * A page made ready to draw on the phone: its stylesheets taken in and every
 * file beside it pointed at its link. `used` is every key it names, here or
 * not yet, so a page kept for later is made again when one of them changes.
 */
export async function phonePage(found: { key: string; place: Place }, link: string, links: Links, read: (url: string) => Promise<string>) {
  const used = new Set<string>([found.key]);
  const linkOf = (key: string) => { used.add(key); return linkOfEntry(links, found.place.files.get(key)?.n); };
  const html = await read(link);
  const styles = new Map<string, string>();
  for (const key of pageStyles(html, found.key)) {
    const l = linkOf(key);
    if (l) styles.set(key, await read(l).catch(() => ''));
  }
  return { html: pageForPhone(withStyles(html, found.key, styles, linkOf), found.key, linkOf), used: [...used] };
}
