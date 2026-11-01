// PURE. The words around a teammate's shared thread, and finding one by name.
import type { ThreadCard } from '../types';
import { filesInLines, threadFiles } from '../../../shared/artifact-marks.mjs';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export const earlierWords = (n: number, owner: string) => `${plural(n, 'earlier message')} ${n === 1 ? 'stays' : 'stay'} on ${owner}'s computer.`;

export const notSharedWords = (owner: string) => `${owner}'s app has not shared these messages yet. They show here the next time it syncs.`;

/** The people's words for a waiting comment on a row: "Maya commented: …". */
export function commentLine(comments: { by: string; text: string }[] | undefined, nameOf: (id: string) => string): string | null {
  if (!comments?.length) return null;
  const last = comments[comments.length - 1];
  const others = new Set(comments.map((c) => c.by)).size - 1;
  return `${nameOf(last.by)}${others > 0 ? ` and ${plural(others, 'other')}` : ''} commented: ${last.text}`;
}

/** Teammates' threads whose title holds every word typed, for Ctrl+K. */
export function teammateThreadsFound(cards: ThreadCard[], me: string | null | undefined, query: string): ThreadCard[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return cards.filter((c) => {
    if (c.personId === me || !c.visible || !c.title) return false;
    const title = c.title.toLowerCase();
    return words.every((w) => title.includes(w));
  });
}

/** Under the "Waiting on Dev" at the top of a teammate's thread: what that means, in one line. */
export function standingLine(state: ThreadCard['state'], owner: string, waits: string | null): string | null {
  if (state === 'running') return `${owner}'s agent is working on it.`;
  if (state === 'waiting') return waits ? 'It starts again when that is done.' : `The agent stopped. ${owner} looks at it next.`;
  return null;
}

/**
 * The files beside a teammate's thread: each file once, at its newest version,
 * with the notes on any of its versions. The same families the file view
 * pages through (shared/artifact-marks.mjs), so a note counted here is one it shows.
 */
export function filesOnThread(lines: unknown[], notes: { file: string }[]): { src: string; name: string; notes: number }[] {
  return threadFiles(filesInLines(lines)).map((family) => {
    const newest = family.versions[family.versions.length - 1];
    const ids = new Set(family.versions.map((v) => v.id));
    return { src: newest.path, name: newest.name, notes: notes.filter((n) => ids.has(n.file)).length };
  });
}
