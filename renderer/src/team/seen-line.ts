// "Seen by Dev, 1:55pm" under your newest message, from the read marks the
// others in the conversation left (main/team/index.mts `seen`).
import { clock, dayHeading } from '../thread-history';

interface Said { kind?: string; who?: string; by?: string; uid?: string; at: number; pending?: boolean; deleted?: boolean; voice?: unknown }

export function seenLine({ events, me, others, seen, nameOf, now = Date.now() }: {
  events: readonly Said[];
  me: string | null;
  /** Everyone else in the conversation. */
  others: readonly string[];
  /** When each of them last opened it. */
  seen: Readonly<Record<string, number>> | null | undefined;
  nameOf: (id: string) => string;
  now?: number;
}): { uid: string; text: string; title?: string } | null {
  if (!me || !others.length || !seen) return null;
  const said = events.filter((e) => e.kind !== 'work' && e.kind !== 'run' && e.uid && !e.pending);
  const last = said[said.length - 1];
  // Once someone answers, the answer says it reached them.
  if (!last || last.deleted || last.voice || last.who !== 'you' || (last.by && last.by !== me)) return null;
  const when = (ts: number) => (dayHeading(ts, now) === 'Today' ? clock(ts) : `${dayHeading(ts, now)} ${clock(ts)}`);
  const have = others.filter((p) => (seen[p] ?? 0) >= last.at);
  if (!have.length) return null;
  if (others.length === 1) return { uid: last.uid!, text: `Seen by ${nameOf(have[0])}, ${when(seen[have[0]])}` };
  return {
    uid: last.uid!,
    text: have.length === others.length ? 'Seen by everyone' : `Seen by ${have.length} of ${others.length}`,
    title: have.map((p) => `${nameOf(p)} ${when(seen[p])}`).join(', '),
  };
}
