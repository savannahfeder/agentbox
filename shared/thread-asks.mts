// ASKING A TEAMMATE FOR SOMETHING ON YOUR THREAD, WITHOUT GIVING IT AWAY.
//
// An ask is a task to one person (team-rules GIVEN_TASK) whose `ask` names the
// giver's thread. Two kinds:
//   help    they jump in: what they write on the thread goes to its agent, as
//           theirs, until they hand it back (main/team/index.mts relays it)
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

const isOpen = (row: AskRow) => row.status !== 'done';

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

/** The word under an ask's name in a list, where "Task" goes on any other. */
export const askWord = (kind: AskKind): string => (kind === 'help' ? 'Help' : 'Review');

/** What the giver's thread says once the ask comes back. */
export function handedBackWords({ kind, name, verdict, words }: { kind: AskKind; name: string; verdict: Verdict | null; words: string }): string {
  const said = words.trim();
  const head = kind === 'review'
    ? verdict === 'yes' ? `${name} reviewed this and it looks good.` : verdict === 'changes' ? `${name} reviewed this and asked for changes.` : `${name} reviewed this.`
    : `${name} handed this back.`;
  return said ? `${head}\n\n${said}` : head;
}

/** The first lines of the task the helper gets: who asked, for what, and the step if one was picked. */
export function askBody({ kind, owner, note, step }: { kind: AskKind; owner: string; note: string; step?: string | null }): string {
  const lead = kind === 'help'
    ? `${owner} asked you to help on this thread. What you write there goes to ${owner}'s agent until you hand it back.`
    : `${owner} asked you to review this thread and send it back with your answer.`;
  const quoted = step?.trim() ? step.trim().split('\n').map((l) => `> ${l}`).join('\n') : '';
  return [note.trim(), quoted, lead].filter(Boolean).join('\n\n');
}
