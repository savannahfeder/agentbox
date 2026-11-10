// A thread's runs once its middle was asked for: every log read whole once
// (`every`), with the regular read (`newest`) laid over it as it keeps arriving.
import type { TraceSession } from './notes';

// The line main/run-traces.mts puts on a log it cut to its tail.
const CUT = /^… truncated \((\d+) bytes total\)\n\n/;

// A log only grows, so a cut tail starts at a known place in the whole copy.
function joined(whole: string, newest: string): string {
  const cut = CUT.exec(newest);
  if (!cut) return newest;
  const tail = newest.slice(cut[0].length);
  const from = Number(cut[1]) - tail.length;
  return whole.length >= from ? whole.slice(0, from) + tail : newest;
}

export function withEveryRun(every: TraceSession[], newest: TraceSession[]): TraceSession[] {
  if (!every.length) return newest;
  const runs = new Map(every.map((s) => [s.startedAt, s]));
  for (const s of newest) {
    const whole = runs.get(s.startedAt);
    runs.set(s.startedAt, whole ? { ...s, text: joined(whole.text, s.text) } : s);
  }
  return [...runs.values()].sort((a, b) => a.startedAt - b.startedAt);
}
