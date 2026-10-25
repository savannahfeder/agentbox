// Taking back a task she just sent with Z. Closing it stops the worker, so a
// task the agent has not answered yet is truly withdrawn. One it has answered
// is not: closing would only hide the answer in Done, and the words put back
// in the composer would run it again if sent.

/** Whether an agent has already written its answer onto the row. */
export function answeredAlready(row: { result?: string | null } | null | undefined): boolean {
  return !!row && !!String(row.result ?? '').trim();
}

export const TOO_LATE_TO_WITHDRAW = 'Too late to take it back: the agent already answered. Here it is.';
