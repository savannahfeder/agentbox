// THE WORK THE THINKING MARK IS ALREADY SPEAKING FOR.
//
// Two sentences, two rules, and this file is the second one:
//
//   "if there's text in between, it can leave behind those steps"
//      work that has a message after it STAYS. It is what the agent did before
//      it spoke, the mark has moved on from it, and it is the record.
//
//   "the furthest-down thing is the thinking component"
//      work with nothing after it GOES, because that is precisely the stretch
//      the mark is standing for: its word is the newest of them, its `+3` is
//      how many are behind it, and opening it lists them all.
//
// The caller applies this only while a session is up. Once the run ends there
// is no mark to stand in for them and they come back whole.

export function withoutTrailingWork<T extends { kind?: string; yours?: boolean }>(events: T[]): T[] {
  // What she did herself is not the mark's to speak for, so it stays, and only
  // the agent's commands after it go.
  const keep = (e: T | undefined) => e?.kind !== 'work' || !!e?.yours;
  let end = events.length;
  while (end > 0 && !keep(events[end - 1])) end -= 1;
  return end === events.length ? events : events.slice(0, end);
}
