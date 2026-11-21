// A SEND STILL WAITING FOR INTERNET WHEN ITS PAGE CLOSES goes on without it,
// on the inbox's next good read, under the same few tries (lib/offline.ts).
// Opening the page again takes it back, so it is never sent from two places.
import { dueAgain, failedSend, type Waiting } from './offline';

type Due = NonNullable<Waiting>;

export function carriedSends<C>() {
  const held = new Map<string, { waiting: Due; say: string; run: (cloud: C) => Promise<void> }>();
  // What a send that gave up left for its page to say when it opens.
  const left = new Map<string, string>();
  return {
    carry(key: string, waiting: Due, say: string, run: (cloud: C) => Promise<void>) {
      left.delete(key);
      held.set(key, { waiting, say, run });
    },
    /** The send this page left waiting, or what it ended with, for the page to carry on from. */
    takeBack(key: string): { waiting: Waiting; say: string | null } {
      const h = held.get(key);
      const said = left.get(key) ?? null;
      left.delete(key);
      // One whose try is still out finishes here; the page starts plain.
      if (!h || h.waiting.since === Number.POSITIVE_INFINITY) return { waiting: null, say: said };
      held.delete(key);
      return { waiting: h.waiting, say: h.say };
    },
    async goAgain(cloud: C, onlineAt: number, now = Date.now()) {
      await Promise.all([...held].map(async ([key, h]) => {
        if (!dueAgain(h.waiting, onlineAt)) return;
        const was = h.waiting;
        h.waiting = { ...was, since: Number.POSITIVE_INFINITY };
        try {
          await h.run(cloud);
          held.delete(key);
        } catch (err) {
          const r = failedSend(was, String((err as Error)?.message ?? err), now);
          if (r.waiting) { h.waiting = r.waiting; h.say = r.say; return; }
          held.delete(key);
          left.set(key, r.say);
        }
      }));
    },
  };
}
