// SHARE… ON A THREAD: send it by link, put it in a teammate's inbox, and,
// last and small, who can open it (w-d19fcb9309, approved send-0, -2, -3, -4).

export type SeenBy = 'team' | 'people' | 'private';
export interface SharePerson { id: string; name?: string | null; email?: string | null }

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

export const firstName = (p: SharePerson | null | undefined) => String(p?.name || p?.email || '').trim().split(/[\s@]+/)[0] || 'them';

/** The one teammate the menu names, the one you sent to last if they are still here, else the first. */
export function sendFirst<P extends SharePerson>(people: readonly P[], last: string | null | undefined): P | null {
  return people.find((p) => p.id === last) ?? people[0] ?? null;
}

/** What the Who can open it row says it is now. */
export function seenWord(seen: SeenBy, teamName: string | null | undefined, chosen = 0): string {
  if (seen === 'private') return 'Only you';
  if (seen === 'people') return chosen === 1 ? '1 person' : `${chosen} people`;
  return String(teamName ?? '').trim() || 'Team';
}

/** Typed into To: the teammates whose name or email starts a word with it, not the ones already picked. */
export function matchPeople<P extends SharePerson>(people: readonly P[], typed: string, picked: readonly string[]): P[] {
  const q = typed.trim().toLowerCase();
  return people.filter((p) => !picked.includes(p.id)
    && (!q || [p.name, p.email].some((s) => String(s ?? '').toLowerCase().split(/[\s@.]+/).some((w) => w.startsWith(q)))));
}

/**
 * What sending puts on the thread, so it is open to the people it went to:
 * a Team thread stays Team, anything else adds them to its chosen people.
 */
export function openTo(seen: SeenBy, visibleTo: readonly string[] | undefined, to: readonly string[]): { visibility: 'team' | 'people'; visibleTo: string[] } {
  return { visibility: seen === 'team' ? 'team' : 'people', visibleTo: [...new Set([...(visibleTo ?? []), ...to])] };
}

/** What the window does for Share…, handed to the thread page. */
export interface ShareActs {
  /** The teammate last sent a thread, named first in the menu. */
  last: string | null;
  copy: (item: { product: string; id: string }) => Promise<boolean>;
  send: (item: { product: string; id: string }, to: string[], note: string) => void;
  see: (item: { product: string; id: string }, to: SeenBy) => void;
}

/** The message a teammate gets in their Needs you: the thread's name as its link, then the note. */
export function sentWords(title: string, link: string, note: string): string {
  const name = String(title || 'A thread').replace(/[[\]]/g, '').trim();
  return note.trim() ? `[${name}](${link})\n\n${note.trim()}` : `[${name}](${link})`;
}
