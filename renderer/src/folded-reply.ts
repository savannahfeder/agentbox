// PURE. What the reply dock says once it has folded shut.
//
// This is about the fold that App.tsx does when she clicks an inert part of
// the window. Nothing is lost when it happens:
// `drafts.ts` writes the user's words on every keystroke and the box opens on them
// again. But what she is left looking at is a pill reading "Reply…", the same
// pill a thread she has never typed a word into shows, so the app is telling
// her there is no message here while her message sits one key away.
//
// COLLAPSING IS NOT HIDING. A folded thing shows a smaller version of itself.
// So the pill carries her own sentence when there is one, and the invitation
// only when there is genuinely nothing under it.

export interface FoldedAttachment {
  name: string;
  image?: boolean;
}

export interface FoldedReply {
  /** Is there something of hers under the fold? Decides the pill's voice. */
  draft: boolean;
  /** The line the pill says: the user's words when there are any, else the invitation. */
  text: string;
  /** Her pasted files said in words, or '' when there are none. */
  files: string;
}

/** How much of her sentence the pill carries before it trails off. */
export const FOLDED_BUDGET = 100;

/**
 * One line out of however many were written.
 *
 * Her draft can be paragraphs; the pill is a single line inside a control that
 * also holds a key hint. Blank lines and newlines become single spaces so the
 * shape of the typed text does not leak into it as gaps.
 */
function oneLine(words: string): string {
  return words.replace(/\s+/g, ' ').trim();
}

/** Stop on a word, never mid-word, and say out loud that there is more. */
function clip(line: string, budget: number): string {
  if (line.length <= budget) return line;
  const cut = line.slice(0, budget);
  const space = cut.lastIndexOf(' ');
  return `${(space > budget * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * Her staged files, counted in the words she would use.
 *
 * A screenshot she pasted and did not type over is as much of an unfinished
 * message as a sentence (the same rule `hasDraft` holds), and it is the half
 * that has no words of its own to show. Without this line a folded box holding
 * only an image is indistinguishable from an empty one.
 */
function filesSaid(attachments: FoldedAttachment[]): string {
  const kept = (attachments ?? []).filter((a) => a && a.name);
  if (!kept.length) return '';
  const noun = kept.every((a) => a.image) ? 'image' : 'file';
  return `${kept.length} ${noun}${kept.length === 1 ? '' : 's'}`;
}

/**
 * What the folded dock says.
 *
 * `agentName` is the agent this thread belongs to, and only decorates the
 * invitation: once she has typed something, the pill is her sentence and
 * nothing else, because that is the thing she came back to look for.
 */
export function foldedReply(
  words: string,
  attachments: FoldedAttachment[] = [],
  agentName?: string | null,
  budget = FOLDED_BUDGET,
): FoldedReply {
  const line = oneLine(String(words ?? ''));
  const files = filesSaid(attachments);
  if (!line && !files) {
    return { draft: false, text: agentName ? `Reply to ${agentName}…` : 'Reply…', files: '' };
  }
  // Images with nothing typed over them: the count IS the message, so it moves
  // into the sentence slot rather than sitting beside an empty one.
  if (!line) return { draft: true, text: files, files: '' };
  return { draft: true, text: clip(line, budget), files };
}
