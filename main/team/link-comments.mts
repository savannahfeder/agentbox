// COMMENTS ON THIS PERSON'S SHARED LINKS, PUT ON THE THREAD EACH FILE CAME FROM
// (new_comments_on_my_links in 20261105000001_a_file_anyone_with_its_link_can_read.sql).
// A link's source is `<project>/<thread>/<file>` (main/file-link.mts linkSource).

import type { NotePlace } from '../../shared/artifact-marks.mts';

const QUOTE_MAX = 180;

export interface LinkComment { token: string; source: string; name: string; byName: string; text: string; at: number; place?: NotePlace | null }
export interface LinkThread { product: string; thread: string }

export function threadOfSource(source: unknown): LinkThread | null {
  const [product, thread] = String(source ?? '').split('/');
  return product && thread ? { product, thread } : null;
}

const quoted = (text: unknown) => {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  return `"${t.length > QUOTE_MAX ? `${t.slice(0, QUOTE_MAX - 1).trimEnd()}…` : t}"`;
};

/** One file's new comments, oldest first, as one note. */
export function noteFor(comments: LinkComment[]): string {
  const last = comments[comments.length - 1];
  if (comments.length === 1) return `${last.byName} commented on ${last.name}. ${quoted(last.text)}`;
  return `${comments.length} new comments on ${last.name}. The newest is from ${last.byName}. ${quoted(last.text)}`;
}

/**
 * Notes the comments since the cursor and moves the cursor past them. The
 * first look only starts the cursor, so nothing from before is told again.
 * Answers how many notes it wrote.
 */
export async function noticeLinkComments({ backend, cursor, setCursor, now, readItem, write, log = () => {} }: {
  backend: { newLinkComments?(since: number): Promise<LinkComment[]> } | null | undefined;
  cursor: () => number | null;
  setCursor: (at: number) => void;
  now: () => number;
  readItem: (place: LinkThread) => unknown;
  write: (place: LinkThread, note: string, comment: { name: string; file: string; text: string; place?: NotePlace }) => unknown;
  log?: (line: string) => void;
}): Promise<number> {
  if (!backend?.newLinkComments) return 0;
  const since = cursor();
  if (since == null) { setCursor(now()); return 0; }
  const comments = await backend.newLinkComments(since);
  if (!comments?.length) return 0;
  const bySource = new Map<string, LinkComment[]>();
  for (const c of comments) bySource.set(c.source, [...(bySource.get(c.source) ?? []), c]);
  let wrote = 0;
  for (const [source, list] of bySource) {
    const place = threadOfSource(source);
    if (!place || !readItem(place)) continue;
    // One line a comment, so the thread holds each of them and its place (shared/work-items.mts linkComments).
    try {
      for (const c of list) write(place, noteFor([c]), { name: c.byName, file: c.name, text: c.text, ...(c.place ? { place: c.place } : {}) });
      wrote += 1;
    } catch (err) { log(`link comments: ${(err as Error).message}`); }
  }
  setCursor(Math.max(...comments.map((c) => c.at)));
  return wrote;
}
