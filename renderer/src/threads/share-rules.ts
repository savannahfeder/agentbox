// SHARE… ON A THREAD: send it by link, put it in a teammate's inbox, and,
// last and small, who can open it (w-d19fcb9309, approved send-0, -2, -3, -4).
import { threadOfLink, type SeenBy } from '../../../shared/thread-link.mts';

export { LINK_SITE, openTo, seenNow, sentWords, threadLink, threadOfLink, type SeenBy } from '../../../shared/thread-link.mts';
export interface SharePerson { id: string; name?: string | null; email?: string | null }

/** The thread a plain click on this link opens in the app; a ⌘, Ctrl or Shift click is the browser's. */
export function threadToOpen(href: string | null | undefined, keys: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }): { owner: string; id: string } | null {
  return keys.metaKey || keys.ctrlKey || keys.shiftKey ? null : threadOfLink(href);
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

interface CopyDoc {
  createElement: (tag: 'textarea') => { value: string; style: object; setAttribute: (k: string, v: string) => void; select: () => void; remove: () => void };
  body: { appendChild: (el: never) => unknown };
  execCommand: (cmd: 'copy') => boolean;
}

/** Puts text on the clipboard; a browser that refuses the clipboard API still copies a selected field. */
export async function copyText(text: string, { clipboard = globalThis.navigator?.clipboard, doc = globalThis.document as unknown as CopyDoc }: { clipboard?: { writeText: (t: string) => Promise<void> }; doc?: CopyDoc } = {}): Promise<boolean> {
  try { if (clipboard) { await clipboard.writeText(text); return true; } } catch { /* refused: the field below */ }
  if (!doc) return false;
  const field = doc.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  Object.assign(field.style, { position: 'fixed', opacity: '0', pointerEvents: 'none' });
  doc.body.appendChild(field as never);
  field.select();
  try { return doc.execCommand('copy'); } catch { return false; } finally { field.remove(); }
}

/** Typed into To: the teammates whose name or email starts a word with it, not the ones already picked. */
export function matchPeople<P extends SharePerson>(people: readonly P[], typed: string, picked: readonly string[]): P[] {
  const q = typed.trim().toLowerCase();
  return people.filter((p) => !picked.includes(p.id)
    && (!q || [p.name, p.email].some((s) => String(s ?? '').toLowerCase().split(/[\s@.]+/).some((w) => w.startsWith(q)))));
}

/** Chosen people…: the person picked is added to who can open it, or taken off; nobody left is Only you. */
export function choose(seen: SeenBy, visibleTo: readonly string[] | undefined, id: string): { visibility: 'people' | 'private'; visibleTo: string[] } {
  const now = seen === 'people' ? [...new Set(visibleTo ?? [])] : [];
  const next = now.includes(id) ? now.filter((p) => p !== id) : [...now, id];
  return next.length ? { visibility: 'people', visibleTo: next } : { visibility: 'private', visibleTo: [] };
}

/** What the window does for Share…, handed to the thread page. */
export interface ShareActs {
  /** The teammate last sent a thread, named first in the menu. */
  last: string | null;
  copy: (item: { product: string; id: string }) => Promise<boolean>;
  send: (item: { product: string; id: string }, to: string[], note: string) => void;
  see: (item: { product: string; id: string }, to: SeenBy) => void;
  choose: (item: { product: string; id: string }, id: string) => void;
}

/** Whether an open file is one of this teammate thread's copies (main/team/thread-share.mjs names their folder). */
export const sharedThreadOfDoc = (product: string | null | undefined, card: { personId: string; threadId: string }) => product === `shared-thread:${card.personId}:${card.threadId}`;
