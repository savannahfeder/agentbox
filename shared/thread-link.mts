// A THREAD'S LINK, AND WHAT SENDING IT DOES ABOUT WHO CAN OPEN IT. Share… in
// the window and a hand-off in the main process both send a thread this way.
import { shownToTeam, visibilityOf, type ProjectSeen } from './thread-cards.mts';

export type SeenBy = 'team' | 'people' | 'private';

// The address people pass around reads as ours, as a file's link does (main/file-link.mjs).
export const LINK_SITE = 'https://app.agentbox.ac';
const OUR_HOSTS = new Set(['app.agentbox.ac', 'agentbox-phone.pages.dev']);
const PART = /^[\w-]{1,80}$/;

/** A thread's address; inside Agentbox it opens the thread, for whoever can read its card. */
export function threadLink(owner: string | null | undefined, id: string, site = LINK_SITE): string | null {
  if (!owner || !PART.test(owner) || !PART.test(id)) return null;
  return `${site.replace(/\/+$/, '')}/t/${owner}/${id}`;
}

/** Whose thread a link of ours names, or null for any other address. */
export function threadOfLink(href: string | null | undefined): { owner: string; id: string } | null {
  let u: URL;
  try { u = new URL(String(href ?? '')); } catch { return null; }
  if (u.protocol !== 'https:' || !OUR_HOSTS.has(u.hostname)) return null;
  const m = /^\/t\/([^/]+)\/([^/]+)\/?$/.exec(u.pathname);
  return m && PART.test(m[1]) && PART.test(m[2]) ? { owner: m[1], id: m[2] } : null;
}

/**
 * Who can open it now, by the rule that publishes its card: a thread from
 * before you began sharing that nobody marked is still only yours.
 */
export function seenNow(item: { createdAt?: number; visibility?: string; visibleTo?: readonly string[] } | null | undefined, product: ProjectSeen, since: number | null): SeenBy {
  if (!shownToTeam(item as Parameters<typeof shownToTeam>[0], since, product)) return 'private';
  return visibilityOf(item, product) ?? 'team';
}

/**
 * What sending puts on the thread, so it is open to the people it went to:
 * a Team thread stays Team, anything else adds them to its chosen people.
 */
export function openTo(seen: SeenBy, visibleTo: readonly string[] | undefined, to: readonly string[]): { visibility: 'team' | 'people'; visibleTo: string[] } {
  // Whoever a private thread named before it went private is not let back in.
  const kept = seen === 'private' ? [] : visibleTo ?? [];
  return { visibility: seen === 'team' ? 'team' : 'people', visibleTo: [...new Set([...kept, ...to])] };
}

/** The message a teammate gets in their Needs you: the thread's name as its link, then the note. */
export function sentWords(title: string, link: string, note: string): string {
  const name = String(title || 'A thread').replace(/[[\]]/g, '').trim();
  return note.trim() ? `[${name}](${link})\n\n${note.trim()}` : `[${name}](${link})`;
}
