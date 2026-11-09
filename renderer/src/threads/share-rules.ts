// SHARE… ON A THREAD: send it by link, put it in a teammate's inbox, and,
// last and small, who can open it (w-d19fcb9309, approved send-0, -2, -3, -4).

export type SeenBy = 'team' | 'people' | 'private';
export interface SharePerson { id: string; name?: string | null; email?: string | null }

/** A thread's address on our web app; only someone who can read its card gets past it. */
export function threadLink(site: string | null | undefined, owner: string | null | undefined, id: string): string | null {
  if (!site || !owner || !/^[\w-]{1,80}$/.test(owner) || !/^[\w-]{1,80}$/.test(id)) return null;
  return `${site.replace(/\/+$/, '')}/t/${owner}/${id}`;
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
