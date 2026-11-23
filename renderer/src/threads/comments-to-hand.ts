// The comments on a thread's files that go with it to an agent: which are
// open, whose they are, and the words the agent is given for the ones ticked.
import type { FileNote } from '../types';
import { familyOfName, nextVersionName, placeWords, shownName } from '../../../shared/artifact-marks.mts';

export interface HandedComment {
  id: string;
  by: string | null;
  mine: boolean;
  /** The file's name as a person sees it. */
  name: string;
  /** The quoted words or the pin, or null for the whole file. */
  place: string | null;
  quote: boolean;
  text: string;
  replies: { by: string | null; mine: boolean; text: string }[];
  ts: number;
}

type NoteIn = Pick<FileNote, 'id' | 'file' | 'place' | 'text' | 'by' | 'ts' | 'resolved' | 'pin' | 'replies'>;

/** Every open comment, oldest first; with `files`, only those on those files and their later versions. */
export function commentsToHand(notes: readonly NoteIn[] | null | undefined, { me, files = null }: { me: string | null; files?: readonly string[] | null }): HandedComment[] {
  const families = files ? new Set(files.map((f) => familyOfName(f.replace(/#\d+$/, '')))) : null;
  // A line with no author is yours.
  const mine = (by: string | null | undefined) => (by ?? me) === me;
  return (notes ?? [])
    .filter((n) => !n.resolved && (n.text?.trim() || n.replies?.length))
    .filter((n) => !families || families.has(familyOfName(n.file.replace(/#\d+$/, ''))))
    .sort((a, b) => a.ts - b.ts)
    .map((n) => {
      const words = placeWords(n);
      const quote = n.place?.kind === 'quote';
      return {
        id: n.id,
        by: n.by ?? me,
        mine: mine(n.by),
        name: shownName(n.file.replace(/#\d+$/, '')),
        place: words === 'Whole file' ? null : quote ? (n.place as { text: string }).text : words,
        quote,
        text: n.text.trim(),
        replies: (n.replies ?? []).filter((r) => r.text?.trim()).map((r) => ({ by: r.by ?? me, mine: mine(r.by), text: r.text.trim() })),
        ts: n.ts,
      };
    });
}

type NameOf = (id: string | null) => string;
const whoWrote = (c: { mine: boolean; by: string | null }, nameOf: NameOf) => (c.mine ? 'me' : nameOf(c.by));

/** One comment as a line of the message: what it is on, what it says, who said it. */
export const commentLine = (c: HandedComment, nameOf: NameOf): string =>
  `- On ${c.place === null ? 'the whole file' : c.quote ? `“${c.place}”` : c.place}: ${c.text} (${whoWrote(c, nameOf)})`;

/** The comments as the agent reads them, a block per file, each asking for that file's next version. */
export function commentsForTheAgent(comments: readonly HandedComment[], { nameOf }: { nameOf: NameOf }): string {
  const byFile = new Map<string, HandedComment[]>();
  for (const c of comments) byFile.set(c.name, [...(byFile.get(c.name) ?? []), c]);
  return [...byFile].map(([name, list]) => [
    `Comments on ${name}:`,
    ...list.map((c) => [commentLine(c, nameOf), ...c.replies.map((r) => `  - ${r.text} (${whoWrote(r, nameOf)})`)].join('\n')),
    '',
    // A name the person typed for the result, anywhere in the message, wins over this one.
    `Make the changes they ask for. Save the result as ${nextVersionName(name, 1)} beside ${name} unless the message names another file, and name the new file in your reply.`,
  ].join('\n')).join('\n\n');
}

/** The message a hand-over opens on: its words, then every comment as a line the person can delete. */
export function withComments(body: string, comments: readonly HandedComment[], { nameOf }: { nameOf: NameOf }): string {
  return [body.trim(), commentsForTheAgent(comments, { nameOf })].filter(Boolean).join('\n\n');
}

/** The comments whose lines are still in the message as sent: the ones the agent was given. */
export function handedIn(text: string, comments: readonly HandedComment[], { nameOf }: { nameOf: NameOf }): string[] {
  return comments.filter((c) => text.includes(commentLine(c, nameOf))).map((c) => c.id);
}
