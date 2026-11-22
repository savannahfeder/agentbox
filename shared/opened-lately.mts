// WHAT YOU OPENED LATELY COMES FIRST IN SEARCH. The thread you are looking for
// is most often one you had open in the last hour, and a loose match there is a
// better guess than a close one in a thread from last week.

export const LATELY_FIRST_MS = 2 * 3_600_000;
export const LATELY_MS = 24 * 3_600_000;
const SENT = 500;

/** 2 when you opened it in the last two hours, 1 in the last day, 0 otherwise. */
export function openedBand(at: number | null | undefined, now: number): 0 | 1 | 2 {
  if (!at || !(at > 0)) return 0;
  const age = now - at;
  return age <= LATELY_FIRST_MS ? 2 : age <= LATELY_MS ? 1 : 0;
}

/** The threads opened in the last day, by id. The one on screen is left out: nobody searches for the thread they are reading. */
export function openedLately(seenAt: Readonly<Record<string, number>>, now: number, here?: string | null): Record<string, number> {
  return Object.fromEntries(Object.entries(seenAt).filter(([id, at]) => id !== here && openedBand(at, now) > 0));
}

/** What a window sent as its opened threads, checked: ids to times, the newest few hundred. */
export function openedOf(v: unknown): Record<string, number> {
  if (!v || typeof v !== 'object') return {};
  return Object.fromEntries(Object.entries(v as Record<string, unknown>)
    .filter((e): e is [string, number] => e[0].length <= 120 && typeof e[1] === 'number' && Number.isFinite(e[1]) && e[1] > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, SENT));
}
