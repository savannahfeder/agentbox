// WHAT A MESSAGE IN A THREAD IS, when it is not an ordinary message: a
// teammate's comment (it reaches the owner and starts no agent), a note pinned
// to a place in a file, or an agent's checkpoint on the way to its answer.
import type { AgentTurn, FileMarkLink } from '../types';
import { isHandBack } from '../../../shared/thread-asks.mts';

export interface MessageKindWords { word: string; why?: string; file?: true }

export interface CommentWords { verb: 'commented on' | 'replied on'; file: string; where: string | null; quote: string | null }

/** A comment's head and quote: "commented on sign-up-screens.md", then the words it is about. */
export function commentWords(link: Pick<FileMarkLink, 'kind' | 'file' | 'place' | 'shown' | 'reply'> | null | undefined): CommentWords | null {
  if (link?.kind !== 'note') return null;
  const file = link.shown ?? link.file.replace(/#\d+$/, '');
  if (!file) return null;
  const place = link.place && link.place !== 'Whole file' ? link.place : null;
  const quote = !!place && place.startsWith('“');
  return { verb: link.reply ? 'replied on' : 'commented on', file, where: quote ? null : place, quote: quote ? place : null };
}

/** `helper`: the words came from a person on the team through the owner's copy (`fromId`). */
export function messageKind(e: Pick<AgentTurn, 'says' | 'fileMark' | 'text'> | null | undefined, { helper = false }: { helper?: boolean } = {}): MessageKindWords | null {
  if (!e) return null;
  if (e.fileMark?.kind === 'note') {
    const file = e.fileMark.shown ?? e.fileMark.file.replace(/#\d+$/, '');
    const place = e.fileMark.place && e.fileMark.place !== 'Whole file' ? `, ${e.fileMark.place}` : '';
    return { word: `Note on ${file}${place}`, file: true, ...(e.fileMark.unsent ? { why: 'Goes with your next reply' } : {}) };
  }
  if (e.fileMark?.kind === 'edited') return { word: `Edited ${e.fileMark.shown ?? e.fileMark.file}`, file: true };
  if (e.says === 'comment') return { word: 'Comment', why: 'did not start the agent' };
  // Yours, on a thread you were asked to help on: its owner's computer passes it to their agent.
  if (e.says === 'to-agent' || (helper && !isHandBack(e.text))) return { word: 'To the agent' };
  if (e.says === 'progress') return { word: 'Checkpoint', why: 'progress so far' };
  return null;
}
