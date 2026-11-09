// REMOVING SOMEONE ASKS WHO TAKES THEIR WORK (main/team/departures.mts moves it).
import type { Person, TeamMate } from '../types';

export interface HandoverAsk {
  /** Who can take the work: you first, then the rest of the team, never the leaver. */
  takers: { id: string; name: string }[];
  /** Their AI teammates, each given to the taker or paused. */
  mates: TeamMate[];
}

export function handoverAsk(people: readonly Person[], mates: readonly TeamMate[] | undefined, me: string | null, leaving: string): HandoverAsk {
  const others = people.filter((p) => p.id !== leaving);
  const takers = [...others.filter((p) => p.id === me), ...others.filter((p) => p.id !== me)]
    .map((p) => ({ id: p.id, name: p.id === me ? 'You' : p.name }));
  return { takers, mates: (mates ?? []).filter((m) => m.owner === leaving) };
}

/** What the remove call carries: the taker, and for each AI teammate the taker or nobody. */
export function handoverOf(handTo: string, mates: readonly TeamMate[], paused: ReadonlySet<string>) {
  return { handTo, mates: mates.map((m) => ({ id: m.id, to: paused.has(m.id) ? null : handTo })) };
}
