// A REACTION SHOWS THE MOMENT YOU PRESS IT (w-45cbac227a).
//
// The chips were drawn only from the row, so a press waited on the write, a
// sync with the team cloud, the push that says something changed and a fresh
// snapshot before it appeared. Now your press is drawn at once, over what the
// row says, until the row agrees with it; a press that fails is dropped, so the
// chip goes back to what is really stored.
// tests/a-reaction-shows-the-moment-you-press-it.
import { useCallback, useEffect, useState } from 'react';

export type Press = { on: string; emoji: string; off: boolean };
/** message uid -> emoji -> the people on it, oldest first (shared/work-items.mts). */
export type Reactions = Record<string, Record<string, string[]>>;

const same = (a: Press, b: Press) => a.on === b.on && a.emoji === b.emoji;

/** Adds a press, replacing any still waiting on the same chip: the newest wins. */
export function press(presses: Press[], next: Press): Press[] {
  return [...presses.filter((p) => !same(p, next)), next];
}

/** The row as it will be once these presses land. The row itself is not changed. */
export function withPresses(reactions: Reactions | undefined, presses: Press[], me: string | null): Reactions | undefined {
  if (!presses.length || !me) return reactions;
  const out: Reactions = {};
  for (const [uid, chips] of Object.entries(reactions ?? {})) out[uid] = { ...chips };
  for (const p of presses) {
    const chips = out[p.on] ?? (out[p.on] = {});
    const who = (chips[p.emoji] ?? []).filter((id) => id !== me);
    if (!p.off) who.push(me);
    if (who.length) chips[p.emoji] = who;
    else delete chips[p.emoji];
    if (!Object.keys(chips).length) delete out[p.on];
  }
  return out;
}

/** The presses the row has not caught up with yet; the same list if none landed. */
export function stillWaiting(presses: Press[], reactions: Reactions | undefined, me: string | null): Press[] {
  const left = presses.filter((p) => (reactions?.[p.on]?.[p.emoji] ?? []).includes(me ?? '') === p.off);
  return left.length === presses.length ? presses : left;
}

/** The reactions to draw, and the one way to press one. */
export function useReactionsNow(reactions: Reactions | undefined, me: string | null, send: (p: Press) => Promise<unknown>) {
  const [presses, setPresses] = useState<Press[]>([]);
  useEffect(() => { setPresses((was) => stillWaiting(was, reactions, me)); }, [reactions, me]);
  const react = useCallback((on: string, emoji: string, off: boolean) => {
    const p = { on, emoji, off };
    setPresses((was) => press(was, p));
    send(p).catch(() => setPresses((was) => was.filter((x) => x !== p)));
  }, [send]);
  return { reactions: withPresses(reactions, presses, me), react };
}
