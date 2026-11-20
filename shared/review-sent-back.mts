// A REVIEW SENT BACK. The reviewer's verdict goes as their comment on the
// owner's thread, so it needs no new kind of message: the owner's copy ends the
// wait on them as it does for any comment (shared/thread-waits.mts), and reads
// the verdict off the comment's first words to say what came back.

export type Verdict = 'approved' | 'changes';

export const notesWord = (n: number) => `${n} note${n === 1 ? '' : 's'}`;

/** The verdict's own words: the comment's head, and the reviewer's button. */
export const verdictHead = (verdict: Verdict, notes: number): string =>
  verdict === 'approved' ? 'Approved' : notes > 0 ? `Sent back with ${notesWord(notes)}` : 'Sent back';

/** The comment that carries the verdict and the reviewer's note. */
export function sentBackWords({ verdict, notes, note }: { verdict: Verdict; notes: number; note: string }): string {
  const head = verdictHead(verdict, notes);
  const said = note.trim();
  return said ? `${head}: ${said}` : head;
}

const HEAD = /^(Approved|Sent back(?: with (\d+) notes?)?)(?::\s*([\s\S]*))?$/;

/** A comment `sentBackWords` made, read back. */
export function verdictOf(text: string | null | undefined): { verdict: Verdict; notes: number; note: string } | null {
  const m = HEAD.exec(String(text ?? '').trim());
  if (!m) return null;
  return { verdict: m[1] === 'Approved' ? 'approved' : 'changes', notes: Number(m[2] ?? 0), note: (m[3] ?? '').trim() };
}

/** The newest comment that carries a review's verdict. */
export function reviewBack(comments: readonly { by: string; ts: number; text?: string }[] | null | undefined) {
  const c = [...(comments ?? [])].reverse().find((x) => verdictOf(x.text));
  return c ? { by: c.by, at: c.ts, ...verdictOf(c.text)! } : null;
}

/** A verdict as the reviewer's message says it on the owner's thread: what they did, then their note. */
export function verdictMessage(text: string | null | undefined): string | null {
  const v = verdictOf(text);
  if (!v) return null;
  const did = v.verdict === 'approved' ? 'Approved it' : v.notes > 0 ? `Sent it back with ${notesWord(v.notes)}` : 'Sent it back';
  return v.note ? `${did}: ${v.note}` : `${did}.`;
}

/** What the owner's thread says came back, before any quote of the note. */
export function cameBack(first: string, text: string | null | undefined): string | null {
  const v = verdictOf(text);
  if (!v) return null;
  if (v.verdict === 'approved') return `${first} approved`;
  return v.notes > 0 ? `${first} sent it back with ${notesWord(v.notes)}` : `${first} sent it back`;
}

/** The owner's note in what their thread says it asked (thread-ask askedSaid). */
export const askedNote = (said: string | null | undefined): string =>
  /^(?:Asked .+? for help with this step|Sent to .+? to review and send back): ([\s\S]*)$/.exec(String(said ?? ''))?.[1].trim() ?? '';
