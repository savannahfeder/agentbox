// Files in a chat with an AI teammate. They are saved into the project its run
// works in, because a run reads only pictures inside its own project
// (main/supervisor.mts `attachedFiles`).
import { projectNamedIn } from '../../../shared/teammates.mts';

type Place = { slug: string; name?: string | null };
type Mate = { id: string; product: string };

/** The project your words name, else the teammate's own: where the run for this message starts. */
export function whereFilesGo(words: string, t: { product: string }, places: Place[]): string {
  return projectNamedIn(words, places) ?? t.product;
}

export function withFiles(words: string, links: string): string {
  return [words.trim(), links].filter(Boolean).join('\n\n');
}

/** The project a message's files were saved in. */
export function filesProductOf(m: { from: string; to?: string[] | string; filesIn?: string }, team: Mate[]): string | null {
  if (m.filesIn) return m.filesIn;
  const to = Array.isArray(m.to) ? m.to[0] : m.to;
  const who = m.from === 'you' ? to : m.from;
  return team.find((t) => t.id === who)?.product ?? null;
}

/** The full path of a link into the project's attachments, or null for anything else. */
export function attachedPath(src: string | undefined, dir: string | null | undefined): string | null {
  if (!dir || !src) return null;
  const rel = src.replace(/^\.\//, '');
  if (!rel.startsWith('attachments/') || rel.split('/').includes('..')) return null;
  return `${dir}/${rel}`;
}
