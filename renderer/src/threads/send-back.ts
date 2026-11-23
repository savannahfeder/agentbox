// An agent thread started from someone's work sends the agent's new version of
// the file back to them: which file, to whom, and which comments it answers.
import { filesInLines, threadFiles, type FileVersion, type ThreadLine } from '../../../shared/artifact-marks.mts';
import { continuedFrom } from '../../../shared/thread-continued.mts';
import { isTaskRow, taskGiver, type TeamRow } from '../../../shared/team-rules.mts';

/** The agent's newest version of a file the thread was handed, else the newest file it made, or null. */
export function fileToSendBack(lines: readonly ThreadLine[] | null | undefined): FileVersion | null {
  const families = threadFiles(filesInLines(lines));
  const newest = (fs: typeof families) => fs.map((f) => f.versions.at(-1)!).filter((v) => typeof v.agent === 'string').sort((a, b) => b.at - a.at)[0] ?? null;
  return newest(families.filter((f) => f.versions.length > 1 && typeof f.versions[0].agent !== 'string')) ?? newest(families);
}

type Row = TeamRow & { product: string; id: string; labels?: string[] | null };
export type GoesBack = { to: string; task: Row } | { to: string; thread: { personId: string; threadId: string } };

/** The teammate whose task, conversation or thread this one was started from, or null. */
export function whereItGoesBack(item: Pick<Row, 'labels'>, items: readonly Row[], me: string | null): GoesBack | null {
  const handed = (item.labels ?? []).find((l) => l.startsWith('handed-from:'))?.split(':');
  if (handed?.length === 3) {
    const row = items.find((i) => i.product === handed[1] && i.id === handed[2]);
    if (!row) return null;
    const to = isTaskRow(row) ? taskGiver(row) : (row.people ?? []).find((p) => p !== me) ?? row.createdBy ?? null;
    return to && to !== me ? { to, task: row } : null;
  }
  const from = continuedFrom(item.labels);
  return from && from.personId !== me ? { to: from.personId, thread: from } : null;
}

// The file is attached under the words, so they do not name it again.
export const sendBackWords = (answered: number): string => (answered === 0
  ? 'Here is the new version.'
  : answered === 1 ? 'Made the change from the comment.' : `Made the changes from the ${answered} comments.`);

// Which comments a hand-over carried, kept on this computer under the thread it started.
const KEY = (product: string, id: string) => `handed-comments:${product}:${id}`;
export function rememberHanded(product: string, id: string, comments: readonly string[]): void {
  try { if (comments.length) localStorage.setItem(KEY(product, id), JSON.stringify(comments)); } catch { /* the hand-over still stands */ }
}
export function handedComments(product: string, id: string): string[] {
  try { const got = JSON.parse(localStorage.getItem(KEY(product, id)) ?? '[]'); return Array.isArray(got) ? got.filter((x) => typeof x === 'string') : []; } catch { return []; }
}
const SENT = (product: string, id: string) => `sent-back:${product}:${id}`;
export const sentBack = (product: string, id: string): string | null => { try { return localStorage.getItem(SENT(product, id)); } catch { return null; } };
export const markSentBack = (product: string, id: string, path: string): void => { try { localStorage.setItem(SENT(product, id), path); } catch { /* shown again next time */ } };
