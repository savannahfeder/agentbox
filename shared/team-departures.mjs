// A PERSON WHO LEAVES THE TEAM: the one record that crosses the cloud, and the
// words each copy writes on what it moves. The database keeps the same limits
// (20261101093000_a_person_who_leaves_hands_over.sql).
export const MAX_MATES = 20;
const MAX_JOB = 2000;

export function cleanMates(list) {
  return (Array.isArray(list) ? list : []).slice(0, MAX_MATES)
    .filter((m) => m && typeof m.id === 'string' && m.id && m.id.length <= 64)
    .map((m) => ({
      id: m.id,
      name: String(m.name ?? '').trim().slice(0, 80) || 'AI teammate',
      job: typeof m.job === 'string' && m.job.trim() ? m.job.trim().slice(0, MAX_JOB) : null,
      to: typeof m.to === 'string' && m.to ? m.to : null,
    }));
}

/** A departure still counts only while that person is off the team: one who came back keeps their work. */
export function standingDepartures(departures, people) {
  const on = new Set((people ?? []).map((p) => p.id));
  return (departures ?? []).filter((d) => d?.personId && d.handTo && !on.has(d.personId));
}

/** On a row made of someone's work when they left, so it opens in their name rather than as yours. */
export const handedFromLabel = (personId) => `handed-from:${personId}`;
export const handedFrom = (labels) => (labels ?? []).find((l) => typeof l === 'string' && l.startsWith('handed-from:'))?.slice('handed-from:'.length) || null;

export const handedWords = {
  yours: (left) => `${left} left the team. This is yours now.`,
  wentTo: (left, to) => `${left} left the team, so this went to ${to}.`,
  waited: (left, to) => `${left} left the team. ${to} took over their work.`,
  taskBody: (left, body) => `Handed to you from ${left}, who left the team.\n\n${body}`.trim(),
  listTitle: (left) => `${left}'s open threads`,
  listSaid: (left) => `${left} left the team. This is what was open.`,
  listBody: (left, lines) => [
    `${left} left the team with these open. Each title and where it stood came across; the threads stayed on ${left}'s computer.`,
    '',
    ...lines,
  ].join('\n'),
  mateMemory: (left) => `Taken over from ${left}, who left the team. Its memory and method stayed on ${left}'s computer, so it starts from its job.`,
};
