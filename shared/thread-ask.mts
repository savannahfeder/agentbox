// ASKING A TEAMMATE ABOUT A THREAD: help with one step, a review that comes
// back, or handing it over for good. Help and review leave the thread yours,
// waiting on them (shared/thread-waits.mts); a hand-over is main/team handOn.
import { personWait, setByPerson } from './thread-waits.mts';

export type Want = 'help' | 'review' | 'hand';
export const WANTS: readonly Want[] = ['help', 'review', 'hand'];
export const WANT_WORDS: Record<Want, string> = { help: 'Help with this step', review: 'Review and send back', hand: 'Hand it over' };

/** One message of the thread: when it was written, and its words on one line. */
export interface Step { at: number; words: string }

const STEP_CHARS = 140;

function plainLines(text: string): string[] {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]+/g, '')
    .split('\n')
    .map((l) => l.replace(/^\s*(#{1,6}|>|[-+]|\d+[.)])\s+/, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

const cut = (s: string) => (s.length > STEP_CHARS ? `${s.slice(0, STEP_CHARS - 1).trimEnd()}…` : s);

/** The agent's newest words, as the step a help ask points at: its question when it asks one. */
export function latestStep(item: { result?: string | null; note?: string | null; wrote?: { result?: { ts?: number }; note?: { ts?: number } } } | null | undefined): Step | null {
  const noteAt = item?.wrote?.note?.ts ?? 0;
  const resultAt = item?.wrote?.result?.ts ?? 0;
  const [text, at] = noteAt > resultAt ? [item?.note, noteAt] : [item?.result, resultAt];
  const lines = plainLines(String(text ?? ''));
  const line = lines.find((l) => /\?(\s|$)/.test(l)) ?? lines[0];
  return line && at ? { at, words: cut(line) } : null;
}

/** What the sheet starts on: help when the agent's newest words ask something. */
export const wantFirst = (step: Step | null): Want | null => (step && /\?(\s|$)/.test(step.words) ? 'help' : null);

/** A thread's link that opens at one step. */
export const linkAtStep = (link: string, step: Step | null | undefined): string => (step ? `${link}?at=${step.at}` : link);

/** The message the teammate gets: what you want and your note first, so it is their inbox row's line. */
export function askWords({ want, title, link, note, step }: { want: 'help' | 'review'; title: string; link: string; note: string; step?: Step | null }): string {
  const name = String(title || 'A thread').replace(/[[\]]/g, '').trim();
  const said = note.replace(/\s+/g, ' ').trim();
  const at = want === 'help' ? step ?? null : null;
  return [`${WANT_WORDS[want]}: ${said || name}`, `[${name}](${linkAtStep(link, at)})`, at ? `> ${at.words}` : ''].filter(Boolean).join('\n\n');
}

/** What the thread says while it waits on them. */
export function askedSaid(want: 'help' | 'review', names: string, note: string): string {
  const said = note.replace(/\s+/g, ' ').trim();
  const head = want === 'help' ? `Asked ${names} for help with this step` : `Sent to ${names} to review and send back`;
  return said ? `${head}: ${said}` : head;
}

/** The edit that leaves the thread yours, waiting on them, saying what you asked. */
export const askedPatch = (to: readonly string[], said: string, now: number, want: 'help' | 'review') => ({ blockedBy: to.map(personWait), asked: { said, at: now, want } });

export interface AskedItem {
  status?: string;
  blockedBy?: readonly string[];
  asked?: { said: string; at?: number; want?: 'help' | 'review' } | null;
  wrote?: Record<string, { ts?: number; source?: string } | undefined>;
}

/** What you asked, while the wait it set is still the thread's wait. */
export function askedOf(item: AskedItem | null | undefined): { said: string; at: number; want: 'help' | 'review' | null } | null {
  if (!item?.asked?.said || !setByPerson(item)) return null;
  if ((item.wrote?.asked?.ts ?? 0) < (item.wrote?.blockedBy?.ts ?? Infinity)) return null;
  return { said: item.asked.said, at: item.asked.at ?? item.wrote?.asked?.ts ?? 0, want: item.asked.want ?? null };
}

export const askedNow = (item: AskedItem | null | undefined): string | null => askedOf(item)?.said ?? null;

/** Their words answer the step: the owner asked them for help with it, and they wrote after. */
export function helpAnswers(item: AskedItem | null | undefined, by: string, at: number): boolean {
  const asked = askedOf(item);
  return asked?.want === 'help' && at > asked.at && !!item!.blockedBy?.includes(personWait(by));
}

/** On the helper's copy: the card says its owner waits on this person to answer a step. */
export const answersTheStep = (card: { blockedBy?: readonly { id: string; want?: string }[] } | null | undefined, me: string | null): boolean =>
  !!me && !!card?.blockedBy?.some((b) => b.id === personWait(me) && b.want === 'help');

/** The message a step link names on the teammate's copy of the thread: the newest one written by then. */
export function stepLine(events: readonly { kind?: string; at: number; uid?: string; message?: boolean; who?: string }[], at: number): string | null {
  let found: { at: number; uid?: string } | null = null;
  for (const e of events) if (e.kind !== 'work' && e.kind !== 'run' && e.at <= at && (!found || e.at >= found.at)) found = e;
  return found ? found.uid ?? `at-${found.at}` : null;
}
