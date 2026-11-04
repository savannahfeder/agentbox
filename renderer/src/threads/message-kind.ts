// WHAT A MESSAGE IN A THREAD IS, when it is not an ordinary message: a
// teammate's comment (it reaches the owner and starts no agent), a note pinned
// to a place in a file, or an agent's checkpoint on the way to its answer.
import type { AgentTurn } from '../types';

export interface MessageKindWords { word: string; why?: string; file?: true }

export function messageKind(e: Pick<AgentTurn, 'says' | 'fileMark'> | null | undefined): MessageKindWords | null {
  if (!e) return null;
  if (e.fileMark?.kind === 'note') {
    const file = e.fileMark.shown ?? e.fileMark.file.replace(/#\d+$/, '');
    const place = e.fileMark.place && e.fileMark.place !== 'Whole file' ? `, ${e.fileMark.place}` : '';
    return { word: `Note on ${file}${place}`, file: true };
  }
  if (e.fileMark?.kind === 'edited') return { word: `Edited ${e.fileMark.shown ?? e.fileMark.file}`, file: true };
  if (e.says === 'comment') return { word: 'Comment', why: 'did not start the agent' };
  if (e.says === 'progress') return { word: 'Checkpoint', why: 'progress so far' };
  return null;
}

