// PURE. The words around a teammate's shared thread, and finding one by name.
import type { LinkCommentWaiting, ThreadCard } from '../types';
import { filesInLines, threadFiles, versionForPath, type ThreadLine } from '../../../shared/artifact-marks.mts';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export const earlierWords = (n: number, owner: string) => `${plural(n, 'earlier message')} ${n === 1 ? 'stays' : 'stay'} on ${owner}'s computer.`;

export const notSharedWords = (owner: string) => `${owner}'s app has not shared these messages yet.`;

/** The people's words for a waiting comment on a row: "Maya commented: …". */
export function commentLine(comments: { by: string; text: string }[] | undefined, nameOf: (id: string) => string): string | null {
  if (!comments?.length) return null;
  const last = comments[comments.length - 1];
  const others = new Set(comments.map((c) => c.by)).size - 1;
  return `${nameOf(last.by)}${others > 0 ? ` and ${plural(others, 'other')}` : ''} commented: ${last.text}`;
}

const clock = (s: number) => { const w = Math.floor(s); return `${Math.floor(w / 60)}:${String(w % 60).padStart(2, '0')}`; };

/** Comments on a thread's shared links, as one line on its row however many there are. */
export function linkCommentLine(comments: readonly LinkCommentWaiting[] | undefined): string | null {
  if (!comments?.length) return null;
  const last = comments[comments.length - 1];
  const at = last.place?.kind === 'time' ? ` at ${clock(last.place.s)}` : '';
  if (comments.length === 1) return `${last.name} commented on ${last.file}${at}: ${last.text}`;
  const files = new Set(comments.map((c) => c.file));
  const people = [...new Set(comments.map((c) => c.name))].sort();
  const who = people.length > 2 ? `${people.slice(0, -1).join(', ')} and ${people[people.length - 1]}` : people.join(' and ');
  return `${comments.length} comments on ${files.size === 1 ? last.file : plural(files.size, 'file')} from ${who}: ${last.text}`;
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
 * pages through (shared/artifact-marks.mts), so a note counted here is one it shows.
 */
export function filesOnThread(lines: readonly ThreadLine[], notes: { file: string }[]): { src: string; name: string; notes: number }[] {
  return threadFiles(filesInLines(lines)).map((family) => {
    const newest = family.versions[family.versions.length - 1];
    const ids = new Set(family.versions.map((v) => v.id));
    return { src: newest.path, name: newest.name, notes: notes.filter((n) => ids.has(n.file)).length };
  });
}

/** How many notes are on this file, any version of it: what the pane beside the chat says. */
export function notesOnFile(lines: readonly ThreadLine[], notes: readonly { file: string }[], src: string): number {
  const families = threadFiles(filesInLines(lines));
  const version = versionForPath(families, src);
  const family = version ? families.find((f) => f.versions.some((v) => v.id === version.id)) : null;
  const ids = new Set((family?.versions ?? []).map((v) => v.id));
  return notes.filter((n) => ids.has(n.file)).length;
}
