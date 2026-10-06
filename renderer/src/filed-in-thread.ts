// PURE. WHICH TURN CARRIES THE THREADS A RUN FILED (w-2e13752a85).
//
// The list of threads a thread filed (components/ThreadsMade.tsx) was drawn
// under the whole conversation, so it stood over the composer for as long as
// the task was open, however far past it the conversation had moved. It belongs
// where it happened: "it should instead occur at the end of the turn/message
// where it occured, not stuck at the bottom."
//
// THE RULE IS ONE COMPARISON OF TIMES, and nothing is stored to make it. Each
// filed thread already knows the moment it was created and the conversation is
// already a list of moments, so the turn that filed it is the agent's turn that
// was being spoken then, and the list hangs off the END of that turn, which is
// where the agent came back to you carrying it.
//
// THE NEWEST TURN IS THE ONE THAT DOES NOT MOVE. Its last word is the
// checkpoint the pane draws UNDER the conversation rather than a message in it,
// so a list belonging to the newest turn stays at the foot, under that
// checkpoint. It leaves the foot by itself, the moment anything else is said.

/** As much of a conversation event as this rule reads. */
interface Spoken {
  at: number;
  kind?: 'work' | undefined;
  who?: 'you' | 'it';
}

/** As much of a filed thread as this rule reads: when it was filed. */
interface Filed {
  at: number;
}

export interface FiledInThread<T> {
  /** The threads to draw at the end of one turn, by that message's index. */
  onTurn: Map<number, T[]>;
  /** The threads whose turn is the newest one, drawn under the checkpoint. */
  atFoot: T[];
}

/** Where each message sits in the conversation: its index, and whether it is
 *  the agent's last word before you spoke again. A work line is not something
 *  anybody said, so no list ever hangs on one. */
function turnEnds(events: readonly Spoken[]): number[] {
  const said = events.map((e, i) => ({ e, i })).filter(({ e }) => e.kind !== 'work');
  const ends: number[] = [];
  said.forEach(({ e, i }, n) => {
    const next = said[n + 1];
    // The LAST message of the whole conversation is excluded on purpose: its
    // turn is still the newest, and the end of that turn is the foot.
    if (e.who === 'it' && next && next.e.who === 'you') ends.push(i);
  });
  return ends;
}

export function filedOnTurn<T extends Filed>(events: readonly Spoken[], rows: readonly T[]): FiledInThread<T> {
  const ends = turnEnds(events);
  const onTurn = new Map<number, T[]>();
  const atFoot: T[] = [];
  for (const row of [...rows].sort((a, b) => (a.at ?? 0) - (b.at ?? 0))) {
    const at = ends.find((i) => events[i].at >= (row.at ?? 0));
    if (at === undefined) { atFoot.push(row); continue; }
    const had = onTurn.get(at);
    if (had) had.push(row); else onTurn.set(at, [row]);
  }
  return { onTurn, atFoot };
}
