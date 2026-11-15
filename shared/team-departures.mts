// A PERSON WHO LEAVES THE TEAM: the one record that crosses the cloud, and the
// words each copy writes on what it moves. The database keeps the same limits
// (20261101093000_a_person_who_leaves_hands_over.sql).
export const MAX_MATES = 20;
const MAX_JOB = 2000;

/** An AI teammate handed over with a departure. */
export interface HandedMate {
  id: string;
  name: string;
  job: string | null;
  to: string | null;
}

interface MateIn {
  id: string;
  name?: unknown;
  job?: unknown;
  to?: unknown;
}

export function cleanMates(list: unknown): HandedMate[] {
  return (Array.isArray(list) ? (list as unknown[]) : []).slice(0, MAX_MATES)
    .filter((m): m is MateIn => !!m && typeof (m as MateIn).id === 'string' && !!(m as MateIn).id && (m as MateIn).id.length <= 64)
    .map((m) => ({
      id: m.id,
      name: String(m.name ?? '').trim().slice(0, 80) || 'AI teammate',
      job: typeof m.job === 'string' && m.job.trim() ? m.job.trim().slice(0, MAX_JOB) : null,
      to: typeof m.to === 'string' && m.to ? m.to : null,
    }));
}

/** A departure still counts only while that person is off the team: one who came back keeps their work. */
export function standingDepartures<D extends { personId?: string | null; handTo?: string | null }>(
  departures: readonly (D | null | undefined)[] | null | undefined,
  people: readonly { id: string }[] | null | undefined,
): D[] {
  const on = new Set((people ?? []).map((p) => p.id));
  return (departures ?? []).filter((d): d is D => !!(d?.personId && d.handTo && !on.has(d.personId)));
}

/** On a row made of someone's work when they left, so it opens in their name rather than as yours. */
export const handedFromLabel = (personId: string): string => `handed-from:${personId}`;
export const handedFrom = (labels: readonly unknown[] | null | undefined): string | null => (labels ?? []).find((l): l is string => typeof l === 'string' && l.startsWith('handed-from:'))?.slice('handed-from:'.length) || null;

export const handedWords = {
  yours: (left: string) => `${left} left the team. This is yours now.`,
  wentTo: (left: string, to: string) => `${left} left the team, so this went to ${to}.`,
  waited: (left: string, to: string) => `${left} left the team. ${to} took over their work.`,
  taskBody: (left: string, body: string) => `Handed to you from ${left}, who left the team.\n\n${body}`.trim(),
  listTitle: (left: string) => `${left}'s open threads`,
  listSaid: (left: string) => `${left} left the team. This is what was open.`,
  listBody: (left: string, lines: readonly string[]) => [
    `${left} left the team with these open. Each title and where it stood came across; the threads stayed on ${left}'s computer.`,
    '',
    ...lines,
  ].join('\n'),
  mateMemory: (left: string) => `Taken over from ${left}, who left the team. Its memory and method stayed on ${left}'s computer, so it starts from its job.`,
};
