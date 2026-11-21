// ASKING A TEAMMATE FOR SOMETHING ON YOUR THREAD, WITHOUT GIVING IT AWAY.
//
// An ask is a task to one person (team-rules GIVEN_TASK) whose `ask` names the
// giver's thread. Two kinds:
//   help    they jump in: what they write on the thread goes to its agent, as
//           theirs, until they hand it back (main/team/asks.mts relays it)
//   review  they look and comment; their answer comes back to you, and your
//           agent hears it only when you next reply
// Handing back is closing the task with words and a verdict. The thread stays
// the owner's throughout: their computer runs it, and it comes back to their
// Needs you saying what was said.
import { isTaskRow } from './team-rules.mts';
import type { AskPatch, Verdict } from './work-items.mts';

export type AskKind = AskPatch['kind'];
export type Ask = AskPatch;

interface AskRow {
  id: string;
  status?: string;
  assignee?: string | null;
  createdBy?: string | null;
  createdAt?: number;
  updatedAt?: number;
  labels?: readonly string[];
  ask?: Ask | null;
  verdict?: Verdict | null;
  answer?: string | null;
  product?: string;
  wrote?: { ask?: { by?: string; ts?: number } | null; status?: { by?: string; ts?: number } | null } | null;
}

export function askOf(row: AskRow | null | undefined): Ask | null {
  const a = row?.ask;
  if (!row || !isTaskRow(row) || !a || (a.kind !== 'help' && a.kind !== 'review')) return null;
  return a.owner && a.thread ? a : null;
}

/** An ask this person made. A line from the other side could carry any ask, so only the writer's own counts. */
export function askIGave(row: AskRow | null | undefined, me: string | null): Ask | null {
  const a = askOf(row);
  if (!a || !me || a.owner !== me) return null;
  const by = row?.wrote?.ask?.by ?? row?.createdBy;
  return by === me ? a : null;
}

// Handed back is final: a thank-you on the task reopens the conversation, not the ask
// (round three of the team test). Asking again is a new ask.
export const askIsOpen = (row: Pick<AskRow, 'status' | 'verdict'>): boolean => row.status !== 'done' && !row.verdict;
const isOpen = askIsOpen;

/** The open help ask you gave this person on this thread: their words then go to its agent. */
export function helpAskOpen(rows: readonly AskRow[], me: string | null, thread: string, helper: string): AskRow | null {
  return rows.find((r) => {
    const a = askIGave(r, me);
    return !!a && a.kind === 'help' && a.thread === thread && r.assignee === helper && isOpen(r);
  }) ?? null;
}

export interface AskShown { row: AskRow; ask: Ask; to: string; open: boolean; verdict: Verdict | null; words: string; at: number; backAt: number | null }

/** Every ask on one of your threads, newest first, for the line above its reply box. */
export function asksOnThread(rows: readonly AskRow[], me: string | null, thread: string): AskShown[] {
  const out: AskShown[] = [];
  for (const r of rows) {
    const a = askIGave(r, me);
    if (!a || a.thread !== thread || !r.assignee) continue;
    const open = isOpen(r);
    out.push({
      row: r, ask: a, to: r.assignee, open, verdict: open ? null : (r.verdict ?? 'done'),
      words: open ? '' : String(r.answer ?? '').trim(),
      at: r.createdAt ?? 0, backAt: open ? null : (r.wrote?.status?.ts ?? r.updatedAt ?? null),
    });
  }
  return out.sort((x, y) => (y.backAt ?? y.at) - (x.backAt ?? x.at));
}

/** The open ask on a teammate's thread that is waiting on you, if there is one. */
export function askOnMe(rows: readonly AskRow[], me: string | null, owner: string, thread: string): AskRow | null {
  return rows.find((r) => {
    const a = askOf(r);
    return !!a && a.owner === owner && a.thread === thread && r.assignee === me && isOpen(r);
  }) ?? null;
}

/** Asks you gave that were handed back and not yet carried onto the thread. */
export function handedBackAsks(rows: readonly AskRow[], me: string | null, done: ReadonlySet<string>): AskRow[] {
  return rows.filter((r) => {
    const a = askIGave(r, me);
    return !!a && !isOpen(r) && !done.has(r.id) && r.wrote?.status?.by === r.assignee;
  });
}

/** The part of an agent's message a teammate is asked about: the paragraph with its question, else its opening. */
export function stepOf(text: string): string {
  const plain = text.replace(/\*\*|__|`/g, '').trim();
  const paras = plain.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const asked = paras.find((p) => /\?/.test(p)) ?? paras[0] ?? '';
  return asked.length > 600 ? `${asked.slice(0, 600)}…` : asked;
}

/** Who handed this thread back to you, when their words are the newest thing on it and it waits for you. */
export function handedBackBy(row: { status?: string; wrote?: Record<string, { ts?: number; teammate?: string } | undefined> | null } | null | undefined, askedSince = 0): string | null {
  const answer = row?.wrote?.answer;
  if (row?.status !== 'blocked' || !answer?.teammate) return null;
  // A newer ask (still out, or taken back) makes an older hand-back old news.
  const after = Math.max(row.wrote?.result?.ts ?? 0, row.wrote?.note?.ts ?? 0, askedSince);
  return (answer.ts ?? 0) >= after ? answer.teammate : null;
}

/** On your thread's row once someone you asked handed it back: what they said, in a few words. */
export function backWord(first: string, verdict: string | null): string {
  return verdict === 'yes' ? `${first} says it looks good` : verdict === 'changes' ? `${first} asked for changes` : `Back from ${first}`;
}

/** On your thread's row while someone you asked has it: "Theo is reviewing", or null. */
export function askedOutWord(rows: readonly AskRow[], me: string | null, thread: string, nameOf: (id: string) => string, seenAt?: (row: AskRow) => number): string | null {
  const open = asksOnThread(rows, me, thread).filter((a) => a.open);
  if (!open.length) return null;
  const people = new Set(open.map((a) => a.to)).size;
  const first = (nameOf(open[0].to) || 'Someone').split(/\s+/)[0];
  const who = people === 1 ? first : `${people} people`;
  const review = open.every((a) => a.ask.kind === 'review');
  // Nobody has opened it yet: it is asked, not being worked on (round eleven).
  if (seenAt && open.every((a) => seenAt(a.row) < (a.row.createdAt ?? 0))) return `Asked ${who} ${review ? 'for a review' : 'for help'}`;
  return `${who} ${people === 1 ? 'is' : 'are'} ${review ? 'reviewing' : 'helping'}`;
}

/** The word under an ask's name in a list, where "Task" goes on any other. */
export const askWord = (kind: AskKind): string => (kind === 'help' ? 'Help' : 'Review');

/** What the giver's thread says once the ask comes back. */
export function handedBackWords({ kind, name, verdict, words, asked = null }: { kind: AskKind; name: string; verdict: Verdict | null; words: string; asked?: { by: string; note: string } | null }): string {
  const said = words.trim();
  const head = kind === 'review'
    ? verdict === 'yes' ? `${name} reviewed this and it looks good.` : verdict === 'changes' ? `${name} reviewed this and asked for changes.` : `${name} reviewed this.`
    : `${name} handed this back.`;
  // What was asked lived only on the task, so the thread lost it once the ask came back (round four of the team test).
  const ask = asked?.note.trim() ? `${asked.by} had asked: “${asked.note.trim()}”` : '';
  return [head, said, ask].filter(Boolean).join('\n\n');
}

// A hand-back is written on the thread as the helper's words to the agent are
// (`from` on an answer), so only its head line tells the two apart.
const HANDED_BACK = /^\S+ (?:handed this back|reviewed this(?: and it looks good| and asked for changes)?)\.(?:\n|$)/;

/** Whether words on a thread are a hand-back `handedBackWords` wrote. */
export const isHandBack = (text: string | null | undefined): boolean => HANDED_BACK.test(String(text ?? ''));

/** The first lines of the task the helper gets: who asked, for what, and the step if one was picked. */
export function askBody({ kind, owner, helper = null, note, step }: { kind: AskKind; owner: string; helper?: string | null; note: string; step?: string | null }): string {
  // The line over the message says who asked and what for; this says only what it means.
  const lead = kind === 'help'
    ? `${helper ? `${helper}, write` : 'Write'} to ${owner}'s agent on ${owner}'s thread. A reply here goes to ${owner}.`
    : 'Say whether it looks good or what to change.';
  const quoted = step?.trim() ? step.trim().split('\n').map((l) => `> ${l}`).join('\n') : '';
  return [note.trim(), quoted, lead].filter(Boolean).join('\n\n');
}
