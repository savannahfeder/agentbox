// A worker's answer is in its run's log and not on the row, so a view that
// finds a thread's files in the row's lines has to read the runs as well.
import { runNodes } from './item-thread';
import type { TraceSession } from './notes';
import type { LedgerLine } from './thread-history';

/** The row's lines with what each run said, as agent lines, in time order. */
export function withRunsSaid(lines: readonly LedgerLine[], sessions: readonly TraceSession[], by?: string | null): LedgerLine[] {
  const said: LedgerLine[] = sessions.flatMap((s) => runNodes(s).flatMap((n, i) => (
    n.kind !== 'work' && n.who === 'it' && n.text
      ? [{ id: `run:${s.startedAt}:${i}`, ts: n.at, source: 'agent', patch: { note: n.text }, ...(by ? { by } : {}) }]
      : []
  )));
  if (!said.length) return [...lines];
  return [...lines, ...said].sort((a, b) => a.ts - b.ts);
}
