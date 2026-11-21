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

/** Who wrote them, you first, then each teammate in the order they first commented. */
export function whoseComments(comments: readonly HandedComment[], nameOf: (id: string | null) => string): { by: string | null; mine: boolean; name: string; count: number }[] {
  const out: { by: string | null; mine: boolean; name: string; count: number }[] = [];
  for (const c of comments) {
    const had = out.find((o) => o.by === c.by);
    if (had) had.count++;
    else out.push({ by: c.by, mine: c.mine, name: c.mine ? 'You' : nameOf(c.by), count: 1 });
  }
  return [...out.filter((o) => o.mine), ...out.filter((o) => !o.mine)];
}

/** The comments as the agent reads them, a block per file, each asking for that file's next version. */
export function commentsForTheAgent(comments: readonly HandedComment[], { nameOf }: { nameOf: (id: string | null) => string }): string {
  const who = (c: { mine: boolean; by: string | null }) => (c.mine ? 'me' : nameOf(c.by));
  const byFile = new Map<string, HandedComment[]>();
  for (const c of comments) byFile.set(c.name, [...(byFile.get(c.name) ?? []), c]);
  return [...byFile].map(([name, list]) => [
    `Comments on ${name}:`,
    ...list.map((c) => [
      `- On ${c.place === null ? 'the whole file' : c.quote ? `“${c.place}”` : c.place}: ${c.text} (${who(c)})`,
      ...c.replies.map((r) => `  - ${r.text} (${who(r)})`),
    ].join('\n')),
    '',
    // What the person typed above comes first: a name they gave the result wins over this one.
    `Make the changes they ask for. Unless told otherwise above, save the result as ${nextVersionName(name, 1)} beside ${name}, and name the new file in your reply.`,
  ].join('\n')).join('\n\n');
}

/** What the card sends: its words, then the comments still ticked. */
export function withComments(body: string, comments: readonly HandedComment[], leftOut: ReadonlySet<string>, { nameOf }: { nameOf: (id: string | null) => string }): string {
  const said = commentsForTheAgent(comments.filter((c) => !leftOut.has(c.id)), { nameOf });
  return [body.trim(), said].filter(Boolean).join('\n\n');
}
