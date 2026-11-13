// A room's invite link (docs/team/ROOMS-PLAN.md, Joining): the web address
// people share, and the app's own scheme that page opens.
import { nameSlug } from './product-name.mjs';

export const JOIN_SCHEME = nameSlug;
export const JOIN_SITE = `https://${nameSlug}.ac/join/`;

export const joinLink = (token: string): string => `${JOIN_SITE}${token}`;

/** Any link on the app's own scheme: a room invite, or Stripe's way back. */
export const ourLink = (url: unknown): boolean => typeof url === 'string' && url.startsWith(`${JOIN_SCHEME}://`);

const TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

/** The token in a pasted link or a deep link, or the token itself; null for anything else. */
export function tokenFromLink(text: unknown): string | null {
  const s = String(text ?? '').trim();
  if (TOKEN.test(s)) return s;
  const m = /^(?:https?:\/\/[^/\s]+\/join\/|[a-z][a-z0-9+.-]*:\/\/join\/)([A-Za-z0-9_-]+)\/?(?:[?#].*)?$/i.exec(s);
  return m && TOKEN.test(m[1]) ? m[1] : null;
}

const PART = /^[\w-]{1,80}$/;

/** A thread's place on the app's own scheme, which its web page opens: agentbox://t/<owner>/<thread>. */
export const threadAppLink = (owner: string, id: string): string | null => (PART.test(String(owner)) && PART.test(String(id)) ? `${JOIN_SCHEME}://t/${owner}/${id}` : null);

/** Whose thread an agentbox://t/ link names, or null for any other link. */
export function threadFromAppLink(text: unknown): { owner: string; id: string } | null {
  const m = new RegExp(`^${JOIN_SCHEME}://t/([^/?#\\s]+)/([^/?#\\s]+)/?(?:[?#].*)?$`, 'i').exec(String(text ?? '').trim());
  return m && PART.test(m[1]) && PART.test(m[2]) ? { owner: m[1], id: m[2] } : null;
}
