// A worker's answer is in its run's log and not on the row, so whatever finds
// a thread's files in the row's lines reads the runs as well: the big view,
// and main when it hands your notes and approvals to the agent.
import { handsBack } from './cloud-hand-back.mts';
import { traceLines, type TraceSession } from './trace-lines.mts';

export interface RunSaidLine { id: string; ts: number; source: 'agent'; patch: { note: string }; by?: string }

/** The row's lines with what each run said, as agent lines, in time order. */
export function withRunsSaid<L extends { ts: number }>(lines: readonly L[], sessions: readonly TraceSession[], by?: string | null): Array<L | RunSaidLine> {
  // What the thread draws as the agent's words (item-thread.ts runNodes): not its tools, nor a hand-back.
  const said: RunSaidLine[] = sessions.flatMap((s) => traceLines(s).flatMap((l, i) => (
    l.kind !== 'tool' && l.text && !handsBack(l.text)
      ? [{ id: `run:${s.startedAt}:${i}`, ts: l.at, source: 'agent' as const, patch: { note: l.text }, ...(by ? { by } : {}) }]
      : []
  )));
  if (!said.length) return [...lines];
  return [...lines, ...said].sort((a, b) => a.ts - b.ts);
}
