// PURE. How a conversation with a teammate is laid out: which messages open a
// day, and which open a run (a face, a name and a time) rather than carrying on
// the one above. Approved as drawing A of w-2e8aa16f0f (2026-10-05): Slack's
// structure in the app's own materials. Drawn by components/Thread.tsx, styled
// by ./chat.css, pinned by tests/a-conversation-with-a-teammate-reads-like-a-chat.
import { dayHeading } from '../thread-history';

/** One person's messages this close together read as one run. */
export const RUN_GAP_MS = 10 * 60_000;

export interface ChatSlot {
  /** The day line above this event, when it is the first of its day. */
  day: string | null;
  /** Whether this message wears the face, the name and the time. */
  head: boolean;
}

type Said = { kind?: string; at: number; who?: string; by?: string };

// Who said it. A teammate's words carry `by`; a line with no `by` is the agent
// ('it') or the single-person app's own user ('you').
const authorOf = (e: Said) => e.by ?? e.who ?? '';

export function chatLayout(events: readonly Said[], now = Date.now()): ChatSlot[] {
  const out: ChatSlot[] = [];
  let lastDay: string | null = null;
  for (let n = 0; n < events.length; n++) {
    const e = events[n];
    const dayOf = dayHeading(e.at, now);
    const day = dayOf === lastDay ? null : dayOf;
    lastDay = dayOf;
    const prev = events[n - 1];
    // A RUN CARRIES ON only from a message by the same person, on the same day,
    // inside the gap. Anything else between them (something you did, an agent's
    // work) ends it, because the face would otherwise sit above a line that is
    // not theirs.
    const carries = !!prev && prev.kind !== 'work' && e.kind !== 'work' && day === null
      && authorOf(prev) === authorOf(e) && e.at - prev.at <= RUN_GAP_MS;
    out.push({ day, head: e.kind !== 'work' && !carries });
  }
  return out;
}
