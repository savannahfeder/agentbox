// Taking back a task she just sent with Z. Closing it stops the worker, so a
// task the agent has not answered yet is truly withdrawn. One it has answered
// is not: closing would only hide the answer in Done, and the words put back
// in the composer would run it again if sent.
import type { UndoMark } from './undo-marks';

/** Whether an agent has already written its answer onto the row. */
export function answeredAlready(row: { result?: string | null } | null | undefined): boolean {
  return !!row && !!String(row.result ?? '').trim();
}

export const TOO_LATE_TO_WITHDRAW = 'Too late to take it back: the agent already answered. Here it is.';

/** What the thread says once a Z has taken its send back (./undo-marks). */
export const UNDID_SENDING = 'Undid sending it';

type Row = { id: string; product: string; status?: string; wrote?: { status?: { ts: number } } };

/**
 * A thread whose last close is the Z that took its send back: the withdrawal
 * is written as a close, but it is not finished work. Any status written after
 * that Z makes it an ordinary thread again. The mark lives on this Mac only,
 * so the row stays on the ledger and nothing is lost if the mark is.
 */
export function withdrawnSend(row: Row, marks: readonly UndoMark[]): boolean {
  const closed = row.status === 'done' ? row.wrote?.status?.ts : undefined;
  if (closed === undefined) return false;
  return marks.some((m) => m.words === UNDID_SENDING && m.id === row.id && m.product === row.product && closed <= m.at);
}

/** `rows` less the sends taken back, and the same array when there are none. */
export function withoutWithdrawnSends<T extends Row>(rows: T[], marks: readonly UndoMark[]): T[] {
  const sends = marks.filter((m) => m.words === UNDID_SENDING);
  if (!sends.length) return rows;
  const kept = rows.filter((r) => !withdrawnSend(r, sends));
  return kept.length === rows.length ? rows : kept;
}
