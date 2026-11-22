// PURE. The comments and replies on a chat's files, as rows of the chat: who,
// when, the words, and what they are on in the words a thread uses.
import type { ArtifactMark, FileMarkLink } from '../../types';
import { placeWords, shownName } from '../../../../shared/artifact-marks.mts';

export interface ChatComment { id: string; by: string | null; at: number; text: string; link: FileMarkLink }

export function commentsInChat(marks: readonly { id: string; by: string | null; mark: ArtifactMark; at: number }[] | null | undefined): ChatComment[] {
  return (marks ?? [])
    .filter((r) => (r.mark.do === 'note' || r.mark.do === 'reply') && r.mark.id && r.mark.file && r.mark.text?.trim())
    .sort((a, b) => a.at - b.at)
    .map((r) => ({
      id: r.mark.id!,
      by: r.by,
      at: r.at,
      text: r.mark.text!.trim(),
      link: {
        kind: 'note',
        file: shownName(r.mark.file!),
        ...(r.mark.do === 'reply' ? { reply: true as const, id: typeof r.mark.on === 'string' ? r.mark.on : undefined } : { id: r.mark.id, place: placeWords({ place: r.mark.place }) }),
      },
    }));
}
